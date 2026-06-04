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

// ── PAYOUT button — handler que SEMPRE corre primeiro (capture phase) ──────────
// Problema: quotingSwitch('paiement') tem um guard que retorna se
// _isBookingEnabled() for false. O app.js handler seta o flag e tenta chamar
// quotingSwitch, mas existem race conditions e wrappers que podem bloquear.
//
// Solução: corremos em capture (antes do app.js), fazemos tudo nós mesmos,
// e chamamos stopPropagation para o handler do app.js não duplicar.
document.addEventListener('click', function(e) {
  const btn = e.target.closest('#qt-payout-btn');
  if (!btn) return;

  // Tomar controlo completo — stopPropagation evita execução dupla com app.js
  e.stopPropagation();
  e.preventDefault();

  // 1. Verificar/criar dossier activo
  let id = null;
  try { id = localStorage.getItem('expatur_active_dossier') || null; } catch(_) {}

  if (!id) {
    // Tentar criar dossier automaticamente
    if (typeof window.createNewDossier === 'function') {
      try { window.createNewDossier(); } catch(_) {}
      try { id = localStorage.getItem('expatur_active_dossier') || null; } catch(_) {}
    }
    if (!id) {
      if (typeof window.toast === 'function') {
        window.toast('Veuillez d\'abord ouvrir ou créer un dossier.', 'error');
      } else {
        window.alert('Veuillez d\'abord ouvrir un dossier avant de cliquer sur PAYOUT.');
      }
      return;
    }
  }

  // 2. Marcar como reservado (ANTES de chamar qualquer função que verifica booking)
  try {
    localStorage.setItem('expatur_booked_' + id, '1');
    if (!localStorage.getItem('expatur_bookedAt_' + id)) {
      localStorage.setItem('expatur_bookedAt_' + id, new Date().toISOString());
    }
  } catch(_) {}

  // 3. Desbloquear abas de reserva no DOM
  try {
    ['paiement','billet','docs','tasks','finance'].forEach(function(t) {
      const tb = document.getElementById('qt-tab-' + t);
      if (tb) tb.classList.remove('qt-tab-locked');
    });
  } catch(_) {}

  // 4. Chamar _applyBookingTabState para sincronizar estado
  try { if (typeof window._applyBookingTabState === 'function') window._applyBookingTabState(); } catch(_) {}
  try { if (typeof window._dossierRenderTabs === 'function') window._dossierRenderTabs(); } catch(_) {}

  // 5. Tentar quotingSwitch (agora que _isBookingEnabled() retorna true)
  let switched = false;
  try {
    if (typeof window.quotingSwitch === 'function') {
      window.quotingSwitch('paiement');
      switched = true;
    }
  } catch(_) {}

  // 6. Fallback DOM directo se quotingSwitch ainda falhar
  if (!switched) {
    const TABS = ['vols','client','couts','paiement','billet','docs','tasks','finance'];
    TABS.forEach(function(t) {
      const tb = document.getElementById('qt-tab-' + t);
      const pn = document.getElementById('dv-panel-' + t);
      if (tb) tb.classList.toggle('active', t === 'paiement');
      if (pn) pn.classList.toggle('active', t === 'paiement');
    });
    try { window._lastQuotingTab = 'paiement'; } catch(_) {}
  }

  // 7. Scroll topo
  try {
    const host = document.getElementById('quoting-panels-host');
    if (host) host.scrollTop = 0; else window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(_) {}

  // 8. Abrir modal de emissão/paiement
  setTimeout(function() {
    try { if (typeof window.openEmissionModal === 'function') window.openEmissionModal(); } catch(_) {}
  }, 250);

  // 9. Ocultar o botão PAYOUT
  try { if (typeof window._syncPayoutButton === 'function') window._syncPayoutButton(); } catch(_) {}

  if (typeof window.toast === 'function') {
    window.toast('Réservation confirmée — passage en Paiement', 'success');
  }
}, true); // useCapture=true → corre ANTES dos handlers do app.js
