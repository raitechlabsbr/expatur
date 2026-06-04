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

// ══════════════════════════════════════════════════════════════════════════════
// PAYOUT — Nova lógica simples:
//   1. Botão PAYOUT começa DESACTIVADO (disabled)
//   2. Clicar em "Générer le devis" (buildPreview) → activa o PAYOUT
//   3. Clicar em PAYOUT → navega directamente para a aba PAIEMENT
//
// Bypassa completamente o sistema _isBookingEnabled / qt-tab-locked.
// ══════════════════════════════════════════════════════════════════════════════

// ── Estado local ──────────────────────────────────────────────────────────────
let _payoutReady = false;

function _setPayoutReady(ready) {
  _payoutReady = ready;
  const btn = document.getElementById('qt-payout-btn');
  if (!btn) return;
  btn.disabled   = !ready;
  btn.title      = ready ? 'Confirmer et passer au Paiement' : 'Générez d\'abord le devis';
  btn.style.opacity = ready ? '1' : '0.4';
  btn.style.cursor  = ready ? 'pointer' : 'not-allowed';
}

// ── Inicializar PAYOUT como desactivado ───────────────────────────────────────
function _initPayoutBtn() {
  const btn = document.getElementById('qt-payout-btn');
  if (!btn) return;
  // Garantir visibilidade quando na aba couts (override do app.js)
  btn.classList.add('is-visible');
  _setPayoutReady(false);
}

// Correr quando DOM está pronto e quando se abre a aba Tarification
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(_initPayoutBtn, 200); });
} else {
  setTimeout(_initPayoutBtn, 200);
}

// ── Interceptar buildPreview para activar PAYOUT após sucesso ─────────────────
(function hookBuildPreview() {
  function _wrap() {
    if (typeof window.buildPreview !== 'function') return;
    if (window.buildPreview._payoutHook) return;

    const _orig = window.buildPreview;
    window.buildPreview = function() {
      try {
        _orig.apply(this, arguments);
        // buildPreview correu sem erro → activar PAYOUT
        setTimeout(function() { _setPayoutReady(true); }, 100);
      } catch(err) {
        // erro em buildPreview (ex: sem passageiros) → não activar
        throw err;
      }
    };
    window.buildPreview._payoutHook = true;
  }

  _wrap();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wrap);
  } else {
    setTimeout(_wrap, 400); // safety net para patches tardios
  }
})();

// ── Ao mudar de aba: reinicializar PAYOUT ─────────────────────────────────────
// Quando volta à aba Tarification, garantir que o botão está visível
// e manter o estado ready se o devis já foi gerado
(function hookTabSwitch() {
  const _orig = window.quotingSwitch;
  if (typeof _orig !== 'function') return;
  if (window.quotingSwitch._payoutTabHook) return;

  window.quotingSwitch = function(tab) {
    if (typeof _orig === 'function') _orig.apply(this, arguments);
    if (tab === 'couts') {
      setTimeout(function() {
        _initPayoutBtn();
        // Manter estado ready se já tinha sido gerado
        if (_payoutReady) _setPayoutReady(true);
        // Actualizar P&L
        if (typeof window.blCalcPnL === 'function') {
          try { window.blCalcPnL(); } catch(_) {}
        }
      }, 150);
    }
  };
  window.quotingSwitch._payoutTabHook = true;
  window.quotingSwitch._uiFixes = true;
})();

// ── Click handler do PAYOUT — navegação directa para PAIEMENT ────────────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('#qt-payout-btn');
  if (!btn || btn.disabled) return;

  // Tomar controlo total — stopPropagation previne duplicação com app.js
  e.stopPropagation();
  e.preventDefault();

  // 1. Definir o flag de booking no localStorage para que _isBookingEnabled()
  //    retorne true — necessário para que quotingSwitch deixe passar billet/docs/tasks
  let dossierId = null;
  try { dossierId = localStorage.getItem('expatur_active_dossier') || null; } catch(_) {}
  if (dossierId) {
    try {
      localStorage.setItem('expatur_booked_' + dossierId, '1');
      if (!localStorage.getItem('expatur_bookedAt_' + dossierId)) {
        localStorage.setItem('expatur_bookedAt_' + dossierId, new Date().toISOString());
      }
    } catch(_) {}
  }

  // 2. Chamar _applyBookingTabState para sincronizar o estado no app.js
  try { if (typeof window._applyBookingTabState === 'function') window._applyBookingTabState(); } catch(_) {}
  try { if (typeof window._dossierRenderTabs === 'function') window._dossierRenderTabs(); } catch(_) {}

  // 3. Desbloquear TODAS as abas de reserva no DOM (visual + funcional)
  ['paiement','billet','docs','tasks','finance'].forEach(function(t) {
    const tb = document.getElementById('qt-tab-' + t);
    if (tb) { tb.classList.remove('qt-tab-locked'); tb.disabled = false; }
  });

  // Navegar directamente para PAIEMENT via DOM (sem passar pelo guard do app.js)
  const TABS = ['vols','client','couts','paiement','billet','docs','tasks','finance'];
  TABS.forEach(function(t) {
    const tb = document.getElementById('qt-tab-' + t);
    const pn = document.getElementById('dv-panel-' + t);
    if (tb) tb.classList.toggle('active', t === 'paiement');
    if (pn) pn.classList.toggle('active', t === 'paiement');
  });
  try { window._lastQuotingTab = 'paiement'; } catch(_) {}

  // Scroll para o topo
  const host = document.getElementById('quoting-panels-host');
  if (host) host.scrollTop = 0; else window.scrollTo({ top: 0, behavior: 'smooth' });

  // Abrir painel de emissão
  setTimeout(function() {
    try { if (typeof window.openEmissionModal === 'function') window.openEmissionModal(); } catch(_) {}
  }, 200);

  if (typeof window.toast === 'function') {
    window.toast('Passage en Paiement ✓', 'success');
  }
}, true);
