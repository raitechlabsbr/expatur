/**
 * ui-fixes.js — Correcções de UX/comportamento dinâmico
 *
 * Adiciona listeners que faltam nos inputs do app.js original.
 * Carregado depois de app.js e auth.js — usa window.buildPreview, etc.
 */

// ── Debounce helper ───────────────────────────────────────────────────────────
function debounce(fn, delay) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Dispara buildPreview + atualiza P&L ──────────────────────────────────────
function triggerPreviewAndPnL() {
  if (typeof window.buildPreview === 'function') {
    window.buildPreview();
  }
  // dossFinRenderPanel relê _quoteFinalPrice logo após buildPreview
  setTimeout(function() {
    if (typeof window.dossFinRenderPanel === 'function') {
      try { window.dossFinRenderPanel(); } catch(e) {}
    }
  }, 50);
}

const _debouncedPreview = debounce(triggerPreviewAndPnL, 400);

// ── Campos da aba Tarification que devem disparar o preview em tempo real ─────
const PRICE_FIELDS = [
  'price-adulte',
  'price-enfant',
  'price-bebe',
  'discount-value',
  'pax-adultes',
  'pax-enfants',
  'pax-bebes',
  'bags-qty',
  'bags-kg',
  'recap-free-line',
  'offer-name',
  'price-note',
];

function attachPriceListeners() {
  PRICE_FIELDS.forEach(function(id) {
    const el = document.getElementById(id);
    if (!el || el._priceListenerAttached) return;
    el.addEventListener('input', _debouncedPreview);
    el.addEventListener('change', _debouncedPreview); // cobre selects e date pickers
    el._priceListenerAttached = true;
  });

  // validity-date e travel-class também devem disparar (são selects/date)
  ['validity-date', 'travel-class'].forEach(function(id) {
    const el = document.getElementById(id);
    if (!el || el._priceListenerAttached) return;
    el.addEventListener('change', _debouncedPreview);
    el._priceListenerAttached = true;
  });
}

// ── Re-attach quando o painel de Tarification fica visível ───────────────────
// (os painéis são movidos no DOM pelo quotingSwitch, por isso re-attach é seguro)
function onQuotingSwitchToCouts() {
  attachPriceListeners();
}

// Intercepta quotingSwitch para re-attach quando o user abre Tarification
(function() {
  const _origSwitch = window.quotingSwitch;
  if (typeof _origSwitch !== 'function') return;
  window.quotingSwitch = function(tab) {
    _origSwitch.apply(this, arguments);
    if (tab === 'couts') {
      setTimeout(onQuotingSwitchToCouts, 100);
    }
  };
})();

// ── Init: attach assim que o DOM estiver pronto ───────────────────────────────
function init() {
  attachPriceListeners();

  // Re-attach depois de cada switchDossier (os campos são re-renderizados)
  const _origSwitchDossier = window.switchDossier;
  if (typeof _origSwitchDossier === 'function') {
    window.switchDossier = function() {
      _origSwitchDossier.apply(this, arguments);
      setTimeout(attachPriceListeners, 200);
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
