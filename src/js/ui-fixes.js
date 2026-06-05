/**
 * ui-fixes.js — Correcções de UX/comportamento dinâmico
 *
 * Estratégia: event delegation no `document` — funciona independentemente
 * de quando/onde os elementos são adicionados ou movidos no DOM.
 * Não precisa de attachar listeners individuais nem de timing preciso.
 */
import './alert-modal.js';

// ── Re-aplicar role UI quando o Ticketing é aberto ───────────────────────────
// applyRoleUI() corre no login mas _initQuotingSection() ou outros inits podem
// sobrescrever a visibilidade da aba Finance. Hookamos sidebarGo para re-aplicar.
(function hookSidebarForRole() {
  function _wrap() {
    if (typeof window.sidebarGo !== 'function') return;
    if (window.sidebarGo._roleHook) return;
    const _orig = window.sidebarGo;
    window.sidebarGo = function(section) {
      _orig.apply(this, arguments);
      if (section === 'quoting' || section === 'ticketing') {
        // Re-aplicar role UI após a secção Ticketing abrir
        setTimeout(function() {
          if (typeof window._applyRoleUI === 'function') window._applyRoleUI();
        }, 200);
      }
    };
    window.sidebarGo._roleHook = true;
  }
  _wrap();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wrap);
  } else {
    setTimeout(_wrap, 500);
  }
})();

// ── Re-aplicar role UI quando _initQuotingSection corre ─────────────────────
(function hookInitQuoting() {
  function _wrap() {
    if (typeof window._initQuotingSection !== 'function') return;
    if (window._initQuotingSection._roleHook) return;
    const _orig = window._initQuotingSection;
    window._initQuotingSection = function() {
      _orig.apply(this, arguments);
      setTimeout(function() {
        if (typeof window._applyRoleUI === 'function') window._applyRoleUI();
      }, 100);
    };
    window._initQuotingSection._roleHook = true;
  }
  _wrap();
  setTimeout(_wrap, 600);
})();

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

// ── Mover botões de acção do billet para o FUNDO do card ─────────────────────
// No HTML estático, os botões (Sauvegarder, Générer PDF, Émettre) estão acima
// das tabs PASSAGERS/SCAN. Na produção aparecem ABAIXO do conteúdo.
// Esta função move-os para depois dos tab panels, uma única vez.
function _moveBilletActionsToBottom() {
  const card = document.querySelector('#dv-panel-billet .card.full');
  if (!card) return;
  if (card._actionsMoved) return; // só mover uma vez

  // Encontrar o div dos botões (contém bl-emettre-btn)
  const billetBtn = document.getElementById('bl-emettre-btn');
  if (!billetBtn) return;
  const actionsBar = billetBtn.parentElement;
  if (!actionsBar || actionsBar.parentElement !== card) return;

  // Remover da posição actual
  card.removeChild(actionsBar);

  // Adicionar estilos de rodapé
  actionsBar.style.borderTop = '1px solid var(--light, #EBEBED)';
  actionsBar.style.paddingTop = '1rem';
  actionsBar.style.marginTop  = '0.5rem';
  actionsBar.style.justifyContent = 'flex-end';

  // Inserir no fundo do card
  card.appendChild(actionsBar);
  card._actionsMoved = true;
}

// ── Limpar inline styles dos painéis antes de qualquer troca de aba ──────────
function _clearPanelInlineStyles() {
  ['vols','client','couts','paiement','billet','docs','tasks','finance'].forEach(function(t) {
    const pn = document.getElementById('dv-panel-' + t);
    if (pn && pn.style.display !== undefined) pn.style.removeProperty('display');
  });
}

// ── Garantir que abas de reserva estão desbloqueadas se booking está activo ───
// Quando o utilizador clica directamente em DOCUMENTS/TÂCHES/FINANCE, verifica
// se o booking está activo e remove o lock se necessário.
function _ensureTabsUnlockedIfBooked() {
  let isBooked = false;
  try {
    const id = localStorage.getItem('expatur_active_dossier');
    if (id) isBooked = localStorage.getItem('expatur_booked_' + id) === '1';
  } catch(_) {}
  if (!isBooked) return;
  ['paiement','billet','docs','tasks','finance'].forEach(function(t) {
    const tb = document.getElementById('qt-tab-' + t);
    if (tb) { tb.classList.remove('qt-tab-locked'); tb.disabled = false; }
  });
  // Re-aplicar visibilidade Finance para admin
  if (typeof window._applyRoleUI === 'function') window._applyRoleUI();
}

// ── Acutaliza ao mudar de aba para Tarification ───────────────────────────────
// (para quando o utilizador volta à aba e o preço já estava preenchido)
(function hookQuotingSwitch() {
  function _wrap() {
    if (typeof window.quotingSwitch !== 'function') return;
    if (window.quotingSwitch._uiFixes) return; // já wrappado

    const _orig = window.quotingSwitch;
    window.quotingSwitch = function(tab) {
      // Limpar inline styles ANTES de switching — senão ficam bloqueados
      _clearPanelInlineStyles();
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

// ── Wrap dvSwitch — usado por emGoToTickets() → limpa inline styles primeiro ──
// dvSwitch('billet') é chamado pelo botão "ÉMETTRE LE BILLET →"
// Sem este wrap, os style.display='none' do PAYOUT fix bloqueiam a navegação
(function hookDvSwitch() {
  function _wrap() {
    if (typeof window.dvSwitch !== 'function') return;
    if (window.dvSwitch._uiFixes) return;
    const _orig = window.dvSwitch;
    window.dvSwitch = function(tab) {
      _clearPanelInlineStyles();
      _orig.apply(this, arguments);
    };
    window.dvSwitch._uiFixes = true;
  }
  _wrap();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wrap);
  } else {
    setTimeout(_wrap, 400);
  }
})();

// ── Limpar inline styles e desbloquear abas quando se clica em qualquer tab ───
document.addEventListener('click', function(e) {
  const tab = e.target.closest('.dv-tab, .qt-tab, [id^="qt-tab-"], [id^="dv-tab-"]');
  if (!tab) return;
  if (tab.id === 'qt-payout-btn') return;
  _clearPanelInlineStyles();
  _ensureTabsUnlockedIfBooked();
}, true);

// ── "ÉMETTRE LE BILLET →" — navegar para aba TICKETS via quotingSwitch ────────
// emGoToTickets() usa dvSwitch('billet') que só actualiza dv-tab-* (booking tabs).
// No contexto Ticketing precisamos de quotingSwitch('billet') que actualiza
// qt-tab-* (quoting tabs) E chama openBilletModal().
document.addEventListener('click', function(e) {
  const btn = e.target.closest('#em-go-emission-cash');
  if (!btn) return;

  e.stopPropagation();
  e.preventDefault();

  // 1. Limpar inline styles dos painéis
  _clearPanelInlineStyles();

  // 2. Garantir que o booking está marcado
  let dossierId = null;
  try { dossierId = localStorage.getItem('expatur_active_dossier') || null; } catch(_) {}
  if (dossierId) {
    try { localStorage.setItem('expatur_booked_' + dossierId, '1'); } catch(_) {}
  }

  // 3. Desbloquear TODAS as abas de reserva (billet, docs, tasks, finance)
  ['paiement','billet','docs','tasks','finance'].forEach(function(t) {
    const tb = document.getElementById('qt-tab-' + t);
    if (tb) { tb.classList.remove('qt-tab-locked'); tb.disabled = false; }
  });
  try { if (typeof window._applyBookingTabState === 'function') window._applyBookingTabState(); } catch(_) {}

  // 4. Restaurar visibilidade FINANCE para admin (o nosso PAYOUT fix pode ter ocultado)
  const isAdmin = !!(window.__serverSession && window.__serverSession.isAdmin);
  ['qt-tab-finance','dv-panel-finance','snav-financeiro','section-financeiro'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });

  // 5. Navegar para TICKETS (activar qt-tab-billet + dv-panel-billet)
  setTimeout(function() {
    ['vols','client','couts','paiement','billet','docs','tasks','finance'].forEach(function(t) {
      const tb = document.getElementById('qt-tab-' + t);
      const pn = document.getElementById('dv-panel-' + t);
      if (tb) tb.classList.toggle('active', t === 'billet');
      if (pn) pn.classList.toggle('active', t === 'billet');
    });
    try { window._lastQuotingTab = 'billet'; } catch(_) {}

    // Preencher conteúdo do billet
    setTimeout(function() {
      try { if (typeof window.openBilletModal === 'function') window.openBilletModal(); } catch(_) {}
      // Mover botões de acção para o FUNDO do card (abaixo do conteúdo)
      // No HTML estático estão acima das tabs — na produção aparecem em baixo
      _moveBilletActionsToBottom();
    }, 100);

    // Scroll topo
    try {
      const host = document.getElementById('quoting-panels-host');
      if (host) host.scrollTop = 0;
    } catch(_) {}
  }, 50);

  if (typeof window.toast === 'function') window.toast('Passage en Tickets ✓', 'success');
}, true);

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

// ── Click handler do PAYOUT ───────────────────────────────────────────────────
// Estratégia definitiva:
//   1. Capture phase: garante dossier + booking flag + desbloqueia abas
//   2. stopPropagation: evita que o handler do app.js interfira
//   3. Navegação DOM DIRECTA (sem quotingSwitch): só activa os elementos certos
//   4. openEmissionModal() para preencher o formulário de pagamento
document.addEventListener('click', function(e) {
  const btn = e.target.closest('#qt-payout-btn');
  if (!btn || btn.disabled) return;

  e.stopPropagation();
  e.preventDefault();

  // 1. Garantir dossier activo (criar se não existir)
  let dossierId = null;
  try { dossierId = localStorage.getItem('expatur_active_dossier') || null; } catch(_) {}
  if (!dossierId && typeof window.createNewDossier === 'function') {
    try { window.createNewDossier(); } catch(_) {}
    try { dossierId = localStorage.getItem('expatur_active_dossier') || null; } catch(_) {}
  }

  // 2. Setar flag de booking
  if (dossierId) {
    try { localStorage.setItem('expatur_booked_' + dossierId, '1'); } catch(_) {}
    try {
      if (!localStorage.getItem('expatur_bookedAt_' + dossierId)) {
        localStorage.setItem('expatur_bookedAt_' + dossierId, new Date().toISOString());
      }
    } catch(_) {}
  }

  // 3. Desbloquear abas no DOM
  ['paiement','billet','docs','tasks','finance'].forEach(function(t) {
    const tb = document.getElementById('qt-tab-' + t);
    if (tb) { tb.classList.remove('qt-tab-locked'); tb.disabled = false; }
  });
  try { if (typeof window._applyBookingTabState === 'function') window._applyBookingTabState(); } catch(_) {}

  // 4. Navegação DOM directa para PAIEMENT — sem quotingSwitch (que tem wrappers problemáticos)
  //    Activa APENAS qt-tab-paiement e dv-panel-paiement
  const ALL_TABS = ['vols','client','couts','paiement','billet','docs','tasks','finance'];
  ALL_TABS.forEach(function(t) {
    const tb = document.getElementById('qt-tab-' + t);
    const pn = document.getElementById('dv-panel-' + t);
    const isPaie = t === 'paiement';
    if (tb) tb.classList.toggle('active', isPaie);
    if (pn) {
      pn.classList.toggle('active', isPaie);
      // Garantir que só o panel paiement está visível
      if (isPaie) { pn.style.display = ''; pn.style.removeProperty('display'); }
      else         { pn.style.display = 'none'; }
    }
  });
  try { window._lastQuotingTab = 'paiement'; } catch(_) {}

  // 5. Scroll topo
  try {
    const host = document.getElementById('quoting-panels-host');
    if (host) host.scrollTop = 0; else window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(_) {}

  // 6. Preencher formulário de pagamento
  setTimeout(function() {
    try {
      if (typeof window.openEmissionModal === 'function') window.openEmissionModal();
    } catch(_) {}
  }, 150);

  if (typeof window.toast === 'function') window.toast('Passage en Paiement ✓', 'success');
}, true);

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTE — Implementação completa do modal cpmod-overlay
// Funções cpmodClose, cpmodStartEdit, cpmodSaveEdit, cpmodCancelEdit,
// cpmodSwitchTab e clientsViewProfile nunca foram implementadas no app.js.
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  // ── Estado ────────────────────────────────────────────────────────────────
  let _cpmodCurrentId = null;  // id do cliente em edição (null = novo)
  let _cpmodIsNew     = false; // true quando a criar novo cliente

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _cliLoad() {
    try { return JSON.parse(localStorage.getItem('expatur_clients_db') || '[]'); } catch(_) { return []; }
  }
  function _cliSave(list) {
    localStorage.setItem('expatur_clients_db', JSON.stringify(list));
    if (typeof window.clientsRender === 'function') window.clientsRender();
  }
  function _genId() { return 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function _fmtDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('pt-BR'); } catch(_) { return s; }
  }

  // ── Pill (view mode) ─────────────────────────────────────────────────────
  function _pill(label, value) {
    if (!value || value === '—') return '';
    return '<div style="background:rgba(6,32,59,0.04);border:1px solid rgba(6,32,59,0.10);border-radius:7px;padding:0.55rem 0.8rem;">'
      + '<div style="font-size:0.56rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(6,32,59,0.45);margin-bottom:0.25rem;">' + label + '</div>'
      + '<div style="font-size:0.88rem;font-weight:600;color:#06203B;">' + String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      + '</div>';
  }

  // ── Abrir modal (view mode) ───────────────────────────────────────────────
  function _openModal(client, editMode) {
    const overlay = document.getElementById('cpmod-overlay');
    if (!overlay) return;

    _cpmodCurrentId = client ? client.id : null;
    _cpmodIsNew     = !client;

    // Header
    const nameEl = document.getElementById('cpmod-name');
    if (nameEl) nameEl.textContent = client
      ? [client.civilite ? client.civilite + '.' : '', client.prenom, client.nom].filter(Boolean).join(' ') || 'Nouveau client'
      : 'Nouveau client';

    // View mode: preencher pills
    const personal = document.getElementById('cpmod-personal');
    const docs     = document.getElementById('cpmod-docs');
    if (personal) {
      personal.innerHTML = [
        _pill('Prénom',      client && client.prenom),
        _pill('Nom',         client && client.nom),
        _pill('Civilité',    client && client.civilite),
        _pill('Naissance',   client && _fmtDate(client.naissance)),
        _pill('Nationalité', client && client.nationalite),
        _pill('Email',       client && client.email),
        _pill('Téléphone',   client && client.tel),
        _pill('WhatsApp',    client && client.whatsapp),
        _pill('Adresse',     client && [client.adresse, client.cp, client.ville, client.pays].filter(Boolean).join(', ')),
      ].filter(Boolean).join('') || '<div style="color:rgba(6,32,59,0.4);font-size:0.8rem;font-style:italic;">Nenhum dado pessoal.</div>';
    }
    if (docs) {
      docs.innerHTML = [
        _pill('Nº Passeport',  client && client.passport),
        _pill('Expiration',    client && _fmtDate(client.passport_exp)),
      ].filter(Boolean).join('') || '<div style="color:rgba(6,32,59,0.4);font-size:0.8rem;font-style:italic;">Sem documentos.</div>';
    }
    // Notes
    const notesSection = document.getElementById('cpmod-notes-section');
    const notesText    = document.getElementById('cpmod-notes-text');
    if (client && client.notes) {
      if (notesSection) notesSection.style.display = '';
      if (notesText)    notesText.textContent = client.notes;
    } else {
      if (notesSection) notesSection.style.display = 'none';
    }
    // Files
    const filesEmpty = document.getElementById('cpmod-files-empty');
    const filesEl    = document.getElementById('cpmod-files');
    if (filesEl) filesEl.innerHTML = '';
    if (filesEmpty) filesEmpty.style.display = 'block';

    // Modificar/hide o botão Modifier para clientes novos
    const modBtn = document.getElementById('cpmod-modify-btn');
    if (modBtn) modBtn.style.display = _cpmodIsNew ? 'none' : '';

    // Mostrar
    overlay.style.display = 'block';

    // Ir para edit mode se for novo cliente ou se editMode=true
    if (editMode || _cpmodIsNew) {
      window.cpmodStartEdit();
    } else {
      window.cpmodSwitchTab('perfil');
    }
  }

  // ── cpmodClose ────────────────────────────────────────────────────────────
  window.cpmodClose = function() {
    const overlay = document.getElementById('cpmod-overlay');
    if (overlay) overlay.style.display = 'none';
    _cpmodCurrentId = null;
    _cpmodIsNew = false;
    // Limpar campos do formulário de edição
    ['civilite','prenom','nom','email','tel','whatsapp','naissance',
     'nationalite','passport','passport-exp','adresse','cp','ville','pays','notes'].forEach(function(f) {
      const el = document.getElementById('cpedit-' + f);
      if (el) el.value = '';
    });
  };

  // ── cpmodSwitchTab (base — v3.66 faz override posterior) ─────────────────
  if (!window.cpmodSwitchTab) {
    window.cpmodSwitchTab = function(tab) {
      ['perfil','edit','reservas','tasks'].forEach(function(p) {
        const el = document.getElementById('cpmod-panel-' + p);
        if (el) el.style.display = (p === tab) ? (p === 'perfil' ? 'grid' : 'block') : 'none';
      });
      ['perfil','reservas','tasks'].forEach(function(t) {
        const btn = document.getElementById('cpmod-tab-' + t);
        if (!btn) return;
        btn.style.color = t === tab ? 'var(--gold,#D80505)' : 'rgba(6,32,59,0.45)';
        btn.style.borderBottomColor = t === tab ? 'var(--gold,#D80505)' : 'transparent';
      });
      const fDef  = document.getElementById('cpmod-footer-default');
      const fEdit = document.getElementById('cpmod-footer-edit');
      const tabs  = document.getElementById('cpmod-tabs');
      if (tab === 'edit') {
        if (fDef)  fDef.style.display  = 'none';
        if (fEdit) fEdit.style.display = 'flex';
        if (tabs)  tabs.style.display  = 'none';
      } else {
        if (fDef)  fDef.style.display  = 'flex';
        if (fEdit) fEdit.style.display = 'none';
        if (tabs)  tabs.style.display  = 'flex';
      }
    };
  }

  // ── cpmodStartEdit ────────────────────────────────────────────────────────
  window.cpmodStartEdit = function() {
    // Preencher campos com dados do cliente actual
    const all = _cliLoad();
    const c   = _cpmodCurrentId ? all.find(function(x) { return x.id === _cpmodCurrentId; }) : null;

    function sv(f, val) {
      const el = document.getElementById('cpedit-' + f);
      if (el) el.value = val || '';
    }
    if (c) {
      sv('civilite',    c.civilite);
      sv('prenom',      c.prenom);
      sv('nom',         c.nom);
      sv('email',       c.email);
      sv('tel',         c.tel);
      sv('whatsapp',    c.whatsapp);
      sv('naissance',   c.naissance);
      sv('nationalite', c.nationalite);
      sv('passport',    c.passport);
      sv('passport-exp',c.passport_exp);
      sv('adresse',     c.adresse);
      sv('cp',          c.cp);
      sv('ville',       c.ville);
      sv('pays',        c.pays);
      sv('notes',       c.notes);
    }
    window.cpmodSwitchTab('edit');
  };

  // ── cpmodSaveEdit ─────────────────────────────────────────────────────────
  window.cpmodSaveEdit = function() {
    function gv(f) {
      const el = document.getElementById('cpedit-' + f);
      return el ? el.value.trim() : '';
    }
    const now   = new Date().toISOString();
    const prenom = gv('prenom');
    const nom    = gv('nom');
    if (!prenom && !nom) {
      if (typeof window.xpAlert === 'function') window.xpAlert('Prénom ou Nom est requis.', 'warning');
      else alert('Prénom ou Nom est requis.');
      return;
    }

    const all = _cliLoad();
    if (_cpmodIsNew || !_cpmodCurrentId) {
      // Criar novo cliente
      const newClient = {
        id:           _genId(),
        civilite:     gv('civilite'),
        prenom:       prenom,
        nom:          nom,
        email:        gv('email'),
        tel:          gv('tel'),
        whatsapp:     gv('whatsapp'),
        naissance:    gv('naissance'),
        nationalite:  gv('nationalite'),
        passport:     gv('passport'),
        passport_exp: gv('passport-exp'),
        adresse:      gv('adresse'),
        cp:           gv('cp'),
        ville:        gv('ville'),
        pays:         gv('pays'),
        notes:        gv('notes'),
        createdAt:    now,
        updatedAt:    now,
      };
      all.push(newClient);
      _cpmodCurrentId = newClient.id;
      _cpmodIsNew     = false;
    } else {
      // Actualizar cliente existente
      const idx = all.findIndex(function(x) { return x.id === _cpmodCurrentId; });
      if (idx >= 0) {
        Object.assign(all[idx], {
          civilite:     gv('civilite'),
          prenom:       prenom,
          nom:          nom,
          email:        gv('email'),
          tel:          gv('tel'),
          whatsapp:     gv('whatsapp'),
          naissance:    gv('naissance'),
          nationalite:  gv('nationalite'),
          passport:     gv('passport'),
          passport_exp: gv('passport-exp'),
          adresse:      gv('adresse'),
          cp:           gv('cp'),
          ville:        gv('ville'),
          pays:         gv('pays'),
          notes:        gv('notes'),
          updatedAt:    now,
        });
      }
    }

    _cliSave(all);

    if (typeof window.toast === 'function') {
      window.toast('Client sauvegardé ✓', 'success');
    }

    // Voltar para view mode com os novos dados
    const saved = all.find(function(x) { return x.id === _cpmodCurrentId; });
    if (saved) {
      _openModal(saved, false);
    } else {
      window.cpmodClose();
    }

    // Mostrar botão Modifier
    const modBtn = document.getElementById('cpmod-modify-btn');
    if (modBtn) modBtn.style.display = '';
  };

  // ── cpmodCancelEdit ───────────────────────────────────────────────────────
  window.cpmodCancelEdit = function() {
    if (_cpmodIsNew) {
      // Era novo cliente e cancelou → fechar completamente
      window.cpmodClose();
    } else {
      // Voltar para view mode
      window.cpmodSwitchTab('perfil');
    }
  };

  // ── cpmodPopulateBookings (stub) ──────────────────────────────────────────
  if (!window.cpmodPopulateBookings) {
    window.cpmodPopulateBookings = function() {
      const tbody = document.getElementById('cpmod-bookings-tbody');
      if (!tbody) return;
      if (!_cpmodCurrentId) { tbody.innerHTML = '<tr><td colspan="3" style="padding:1rem;text-align:center;color:rgba(6,32,59,0.4);font-style:italic;">Nenhuma reserva.</td></tr>'; return; }
      const all = _cliLoad();
      const c   = all.find(function(x) { return x.id === _cpmodCurrentId; });
      tbody.innerHTML = '<tr><td colspan="3" style="padding:1rem;text-align:center;color:rgba(6,32,59,0.4);font-style:italic;">Sem histórico de reservas.</td></tr>';
    };
  }

  // ── clientsViewProfile — abre modal para cliente existente ou novo ────────
  // Não sobrescrever se já foi definido pela lógica do app.js
  const _existingCVP = window.clientsViewProfile;
  window.clientsViewProfile = function(id) {
    // Chamar override do app.js (v3.66) se existir
    if (typeof _existingCVP === 'function' && _existingCVP !== window.clientsViewProfile) {
      try { _existingCVP.call(this, id); } catch(_) {}
    }

    if (id === null || id === undefined) {
      // Novo cliente
      _openModal(null, true);
      return;
    }

    // Cliente existente
    const all = _cliLoad();
    const c   = all.find(function(x) { return x.id === id; });
    if (!c) { if (typeof window.toast === 'function') window.toast('Cliente não encontrado', 'error'); return; }
    _openModal(c, false);
  };

  console.info('[ui-fixes] cpmod client modal implemented');
})();

// ══════════════════════════════════════════════════════════════════════════════
// CSV IMPORT — Override com suporte correcto ao formato Bitrix24 CRM
//
// Problemas do auto-detect original:
//   - "Middle Name" → nom (errado)
//   - "Details: Name", "Banking details: Name" → nom (errado)
//   - "Details (USA): First Name" → prenom (errado — é billing, não cliente)
//   - Sem suporte ao separador de origem "; " com espaço extra
//   - Sem campo "source" (origem do contacto)
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  // Mapeamento explícito para Bitrix24 (sobrepõe o auto-detect)
  const BITRIX_MAP = {
    'salutation':          'civilite',
    'first name':          'prenom',
    'last name':           'nom',
    'birthday':            'naissance',
    'mobile':              'tel',
    'work phone':          'tel',
    'home phone':          '_homephone',  // guardamos mas não sobrescrevemos tel
    'work e-mail':         'email',
    'home e-mail':         '_homeemail',  // fallback se work e-mail vazio
    'newsletters email':   '',            // ignorar
    'other e-mail':        '',            // ignorar
    'comment':             'notes',
    'responsible':         'agent',       // campo extra
    'source':              'source',      // origem do contacto
    // Ignorar campos de billing/empresa/banco
    'middle name':         '',
    'position':            '',
    'company':             '',
    'fax':                 '',
    'pager number':        '',
    'sms marketing phone': '',
    'other phone number':  '',
    'corporate website':   '',
    'personal page':       '',
    'facebook page':       '',
    'vk page':             '',
    'livejournal':         '',
    'twitter':             '',
    'other website':       '',
    'facebook account':    '',
    'telegram account':    '',
    'vk account':          '',
    'viber contact':       '',
    'instagram comments':  '',
    'network contact':     '',
    'live chat':           '',
    'open channel account':'',
    'other contact':       '',
    'linked user':         '',
    'last updated on':     '',
    'source information':  '',
    'included in export':  '',
    'created by':          '',
    'created':             '',
    'modified by':         '',
    'modified':            '',
    'created by crm form': '',
    'customer journey':    '',
    'utm source':          '',
    'utm medium':          '',
    'utm campaign':        '',
    'utm content':         '',
    'utm term':            '',
    'last contact':        '',
    'id':                  '',
    'photo':               '',
    'observers':           '',
    'contact type':        '',
  };
  // Ignorar tudo que começa com "Details" ou "Banking details"
  function _isBitrix(headers) {
    const h0 = (headers[0] || '').toLowerCase().replace(/\s+/g,' ').trim();
    const h1 = (headers[1] || '').toLowerCase().replace(/\s+/g,' ').trim();
    return (h0 === 'id' || h0 === 'salutation' || h0 === 'photo') &&
           (h1 === 'photo' || h1 === 'salutation' || headers.some(function(h) { return h.toLowerCase().includes('departure'); }));
  }

  function _getBitrixKey(header) {
    const h = (header || '').toLowerCase().trim();
    // Ignorar colunas Details: e Banking:
    if (h.startsWith('details') || h.startsWith('banking') || h.startsWith('departure') || h.startsWith('destination') || h.startsWith('aller') || h.startsWith('returning') || h.startsWith('taille') || h.startsWith('collaborateur')) return '';
    const mapped = BITRIX_MAP[h];
    if (mapped !== undefined) return mapped; // pode ser '' (ignorar)
    // Fallback para headers não mapeados explicitamente
    return null; // null = usar autoDetect original
  }

  function _doImport(rows) {
    if (!rows || !rows.length) return;
    const existing = JSON.parse(localStorage.getItem('expatur_clients_db') || '[]');
    const now = new Date().toISOString();
    let added = 0, updated = 0, skipped = 0;

    rows.forEach(function(r) {
      if (!r.prenom && !r.nom && !r.email) { skipped++; return; }
      // Merge fallbacks
      if (!r.email && r._homeemail) r.email = r._homeemail;
      if (!r.tel && r._homephone) r.tel = r._homephone;
      delete r._homeemail; delete r._homephone;

      // Find existing by email or name
      let idx = -1;
      if (r.email) idx = existing.findIndex(function(c) { return c.email && c.email.toLowerCase() === r.email.toLowerCase(); });
      if (idx < 0 && (r.prenom || r.nom)) {
        const full = ((r.prenom||'')+' '+(r.nom||'')).trim().toUpperCase();
        idx = existing.findIndex(function(c) { return ((c.prenom||'')+' '+(c.nom||'')).trim().toUpperCase() === full; });
      }

      if (idx >= 0) {
        Object.keys(r).forEach(function(k) { if (r[k]) existing[idx][k] = r[k]; });
        existing[idx].updatedAt = now;
        updated++;
      } else {
        r.id = 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        r.createdAt = now;
        r.updatedAt = now;
        existing.push(r);
        added++;
      }
    });

    localStorage.setItem('expatur_clients_db', JSON.stringify(existing));
    if (typeof window.clientsRender === 'function') window.clientsRender();

    // Fechar modal e mostrar resultado
    if (typeof window.csvImportClose === 'function') window.csvImportClose();
    const msg = (added   ? added   + ' adicionado(s)' : '') +
                (updated ? (added?', ':'')+updated+' actualizado(s)' : '') +
                (skipped ? (added||updated?', ':'')+skipped+' ignorado(s)' : '');
    if (typeof window.xpAlert === 'function') window.xpAlert('✓ Importação concluída\n' + msg, 'success');
    else if (typeof window.toast === 'function') window.toast('Importação concluída: ' + msg, 'success');
  }

  // Override do csvHandleFile
  const _origHandleFile = window.csvHandleFile;
  window.csvHandleFile = function(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      // Parse CSV (detectar delimitador)
      const firstLine = text.split(/\r?\n/)[0] || '';
      const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

      const lines = text.split(/\r?\n/).filter(function(l) { return l.trim() !== ''; });
      function parseLine(line) {
        const result = []; let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
          else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
          else cur += ch;
        }
        result.push(cur);
        return result.map(function(v) { return v.trim(); });
      }

      const headers = parseLine(lines[0]);

      if (_isBitrix(headers)) {
        // ── Bitrix24 CRM format ─────────────────────────────────
        const colMap = {};
        headers.forEach(function(h) {
          const key = _getBitrixKey(h);
          if (key === null) return; // não mapeado, ignorar
          if (key !== '') colMap[h] = key;
        });

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = parseLine(lines[i]);
          const obj = {};
          headers.forEach(function(h, idx) { obj[h] = vals[idx] || ''; });
          const contact = {};
          Object.keys(colMap).forEach(function(h) {
            const key = colMap[h];
            if (obj[h] !== undefined) contact[key] = contact[key] || obj[h] || '';
          });
          if (contact.prenom || contact.nom || contact.email) rows.push(contact);
        }

        // Preview simples antes de importar
        const lbl = document.getElementById('csv-filename-label');
        if (lbl) lbl.textContent = file.name + ' · ' + rows.length + ' contacto(s) Bitrix24';

        const s1 = document.getElementById('csv-step-drop');
        const s2 = document.getElementById('csv-step-preview');
        if (s1) s1.style.display = 'none';
        if (s2) s2.style.display = '';

        // Substituir o grid de mapeamento por uma pré-visualização simples
        const grid = document.getElementById('csv-mapping-grid');
        if (grid) {
          grid.innerHTML = '<div style="grid-column:1/-1;background:rgba(22,101,52,0.06);border:1px solid rgba(22,101,52,0.2);border-radius:8px;padding:0.85rem 1rem;font-size:0.8rem;color:#166534;">'
            + '<strong>✓ Formato Bitrix24 detectado</strong><br>'
            + rows.length + ' contacto(s) prontos para importar · '
            + rows.filter(function(r){return r.email;}).length + ' com email · '
            + rows.filter(function(r){return r.tel;}).length + ' com telefone'
            + '</div>';
        }

        // Substituir a função csvDoImport
        window.csvDoImport = function() { _doImport(rows); };

        const btn = document.getElementById('csv-import-btn');
        if (btn) {
          btn.disabled = false;
          btn.style.display = '';  // remover display:none
          btn.textContent = 'Importar ' + rows.length + ' contactos';
        }
        return;
      }

      // Não é Bitrix24 — usar função original
      if (typeof _origHandleFile === 'function') {
        _origHandleFile.call(this, file);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  console.info('[ui-fixes] CSV import: Bitrix24 format override active');
})();
