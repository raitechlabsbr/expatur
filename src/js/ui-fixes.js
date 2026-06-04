/**
 * ui-fixes.js — Correcções de UX/comportamento dinâmico
 *
 * Estratégia: event delegation no `document` — funciona independentemente
 * de quando/onde os elementos são adicionados ou movidos no DOM.
 * Não precisa de attachar listeners individuais nem de timing preciso.
 */
import './alert-modal.js';

// ── Debounce ──────────────────────────────────────────────────────────────────
const _timers = {};
function debounce(key, fn, delay) {
  clearTimeout(_timers[key]);
  _timers[key] = setTimeout(fn, delay);
}

// ── IDs de campos de preço que devem disparar buildPreview + blCalcPnL ────────
const PRICE_IDS = new Set([
  'price-adulte', 'price-enfant', 'price-bebe',
  'discount-value', 'pax-adultes', 'pax-enfants', 'pax-bebes',
  'bags-qty', 'bags-kg', 'recap-free-line', 'offer-name', 'price-note',
  'travel-class', 'validity-date',
]);

// ── Dispara buildPreview → actualiza _quoteFinalPrice → blCalcPnL ─────────────
function refreshPnL() {
  // buildPreview() calcula o preço total e já chama blCalcPnL() internamente
  if (typeof window.buildPreview === 'function') {
    try {
      window.buildPreview();
    } catch(e) {
      // buildPreview falhou (ex: sem passageiros) — tenta só blCalcPnL
      if (typeof window.blCalcPnL === 'function') {
        try { window.blCalcPnL(); } catch(_) {}
      }
    }
  } else if (typeof window.blCalcPnL === 'function') {
    try { window.blCalcPnL(); } catch(_) {}
  }
}

// ── Event delegation: apanha todos os inputs/changes no documento ─────────────
document.addEventListener('input', function(e) {
  const id = e.target && e.target.id;
  if (!id || !PRICE_IDS.has(id)) return;
  debounce('pnl-' + id, refreshPnL, 350);
}, true); // useCapture=true garante que apanha antes de qualquer handler do app

document.addEventListener('change', function(e) {
  const id = e.target && e.target.id;
  if (!id || !PRICE_IDS.has(id)) return;
  debounce('pnl-change-' + id, refreshPnL, 50); // change é instantâneo (selects/dates)
}, true);

// ── Campos numéricos — aceitar apenas dígitos ─────────────────────────────────
// Telefone, WhatsApp e CEP: remove qualquer carácter que não seja dígito
const NUMERIC_ONLY_IDS = new Set(['cli-tel', 'cli-whatsapp', 'cli-cp']);

document.addEventListener('input', function(e) {
  const el = e.target;
  if (!el || !el.id || !NUMERIC_ONLY_IDS.has(el.id)) return;

  const pos   = el.selectionStart;           // guarda posição do cursor
  const orig  = el.value;
  const clean = orig.replace(/[^0-9]/g, ''); // remove tudo excepto dígitos

  if (clean !== orig) {
    el.value = clean;
    // Repositiona o cursor corrigindo a diferença de caracteres removidos
    const removed = orig.slice(0, pos).replace(/[^0-9]/g, '').length;
    el.setSelectionRange(removed, removed);
  }
}, true);

// Impede colagem de texto com letras
document.addEventListener('paste', function(e) {
  const el = e.target;
  if (!el || !el.id || !NUMERIC_ONLY_IDS.has(el.id)) return;
  e.preventDefault();
  const text  = (e.clipboardData || window.clipboardData).getData('text');
  const clean = text.replace(/[^0-9]/g, '');
  document.execCommand('insertText', false, clean);
}, true);

// ── Acutaliza ao mudar de aba para Tarification ───────────────────────────────
// (para quando o utilizador volta à aba e o preço já estava preenchido)
(function hookQuotingSwitch() {
  function _wrap() {
    if (typeof window.quotingSwitch !== 'function') return;
    if (window.quotingSwitch._uiFixes) return; // já wrappado

    const _orig = window.quotingSwitch;
    window.quotingSwitch = function(tab) {
      _orig.apply(this, arguments);
      if (tab === 'couts') {
        setTimeout(function() {
          if (typeof window.blCalcPnL === 'function') {
            try { window.blCalcPnL(); } catch(_) {}
          }
        }, 150);
      }
    };
    window.quotingSwitch._uiFixes = true;
  }

  // Tenta imediatamente; se ainda não estiver definido, espera pelo DOM
  _wrap();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wrap);
  } else {
    setTimeout(_wrap, 300); // safety net para patches que definem quotingSwitch tardiamente
  }
})();
