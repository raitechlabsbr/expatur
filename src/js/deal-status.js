/**
 * deal-status.js — Status canônico do deal + timeline + comments + atribuição
 * (spec 1.x, A3, A9.1-9.2 — Fase 2)
 *
 * - Vocabulário canônico persistido: quote / awaiting_payment / ticketing /
 *   ticketed — em `data.status` do dossier (jsonb, via sync do storage.js) e
 *   na coluna `dossiers.status` (migration 002), com mapeamento do legado
 *   (devis→quote, invoiced→awaiting_payment, issued→ticketed).
 * - Transições derivadas dos sinais reais do app (PAYOUT, ÉMETTRE FACTURE,
 *   pagamento em Finance, ÉMETTRE) observando escritas no localStorage —
 *   cobre qualquer caminho de código, inclusive os internos do app.js que
 *   não passam pelos wrappers de window.*.
 * - Cada transição grava uma linha imutável em `deal_timeline` (A3.1).
 * - Deal novo nasce `quote`, com created_by/assigned_to automáticos para o
 *   criador (A9.1/A9.2) + linha em `deal_assignments`.
 * - Painel direito colapsável no Ticketing com Timeline + Commentaires,
 *   visível apenas em deals ticketed (A3.3); comentários imutáveis (A3.2).
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

const CANON = ['quote', 'awaiting_payment', 'ticketing', 'ticketed'];
const RANK  = { quote: 0, awaiting_payment: 1, ticketing: 2, ticketed: 3 };
const LEGACY = {
  devis: 'quote', draft: 'quote',
  invoiced: 'awaiting_payment', facture: 'awaiting_payment',
  issued: 'ticketed', emitted: 'ticketed',
};
const LABELS_FR = { quote: 'Quote', awaiting_payment: 'En attente de paiement', ticketing: 'En émission', ticketed: 'Émis' };
const LABELS_PT = { quote: 'Cotação', awaiting_payment: 'Aguardando Pagamento', ticketing: 'Em Emissão', ticketed: 'Emitido' };

const MIGRATION_FLAG = 'expatur_canon_status_migrated_v1';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _now() { return new Date().toISOString(); }
function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function _sanit(ref) { return String(ref || '').replace(/[^a-zA-Z0-9]/g, '_'); }
function _readJSON(k, fb) {
  try { const s = localStorage.getItem(k); return s == null ? fb : JSON.parse(s); } catch (e) { return fb; }
}
function _readDossier(id) { return id ? _readJSON('expatur_dossier_' + id, null) : null; }
function _writeDossier(id, d) {
  // setItem normal de propósito: dispara o sync jsonb do storage.js
  try { localStorage.setItem('expatur_dossier_' + id, JSON.stringify(d)); return true; } catch (e) { return false; }
}
function _toast(msg, kind) { if (typeof window.toast === 'function') window.toast(msg, kind || 'success'); }
function _activeId() { try { return localStorage.getItem('expatur_active_dossier') || null; } catch (e) { return null; } }

function _toCanon(s) {
  if (CANON.includes(s)) return s;
  if (s && LEGACY[s]) return LEGACY[s];
  return null;
}

let _user = null;
async function _getUser() {
  if (_user || !SUPABASE_ENABLED || !supabase) return _user;
  try {
    const s = (await supabase.auth.getSession()).data?.session;
    if (s?.user) _user = { id: s.user.id, email: s.user.email || null };
  } catch (e) {}
  return _user;
}

/* ── Índice booking-ref → dossier id (payments/invoice são chaveados por ref) ─ */
let _refIdx = null;
function _buildRefIdx() {
  _refIdx = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('expatur_dossier_') || k === 'expatur_dossier_list') continue;
      const id = k.slice('expatur_dossier_'.length);
      const d = _readJSON(k, null);
      const ref = d && d.fields && d.fields['booking-ref'];
      if (ref) { _refIdx[_sanit(ref)] = id; _refIdx[String(ref)] = id; }
    }
  } catch (e) {}
}
function _idFromRef(refOrSanit) {
  if (!_refIdx) _buildRefIdx();
  let id = _refIdx[refOrSanit];
  if (!id) { _buildRefIdx(); id = _refIdx[refOrSanit]; }
  return id || null;
}
function _indexDossierRef(id, d) {
  const ref = d && d.fields && d.fields['booking-ref'];
  if (!ref) return;
  if (!_refIdx) _buildRefIdx();
  _refIdx[_sanit(ref)] = id;
  _refIdx[String(ref)] = id;
}

/* ── Cálculo canônico a partir dos sinais do app (spec 1.3) ──────────────── */
function computeDealStatus(idOrDossier) {
  const id = typeof idOrDossier === 'string' ? idOrDossier : (idOrDossier && idOrDossier.__id);
  const d  = typeof idOrDossier === 'string' ? _readDossier(idOrDossier) : idOrDossier;
  if (!d) return 'quote';

  // Override manual (kanban "Forcer le statut") vence tudo
  const ov = _toCanon(d.statusOverride);
  if (ov) return ov;

  const ref  = d.fields && d.fields['booking-ref'];
  const sref = ref ? _sanit(ref) : null;
  const t    = d.ticketing || {};

  // ticketed: ÉMETTRE concluído / billet congelado
  if (d.status === 'issued' || d.issuedAt || t.issued || t.frozen) return 'ticketed';
  if (ref && localStorage.getItem('billetFrozen_' + ref) === '1') return 'ticketed';
  const em = t.emState || _readJSON('em_state_' + id, null) || {};
  if (em.issued || em.locked === 'issued') return 'ticketed';

  // ticketing: pagamento (total ou parcial) registrado em Finance/Paiement
  if (sref) {
    const pays = _readJSON('expatur_payments_' + sref, null);
    if (Array.isArray(pays) && pays.some(p => (Number(p && p.amount) || 0) > 0)) return 'ticketing';
  }

  // awaiting_payment: PAYOUT feito + facture émise (ÉMETTRE FACTURE)
  const booked = localStorage.getItem('expatur_booked_' + id) === '1';
  const inv = (sref && _readJSON('expatur_em_invoice_' + sref, null)) || t.emInvoice || null;
  if (booked && inv && (inv.invoiceId || inv.number || inv.invoiceNumber)) return 'awaiting_payment';

  return 'quote';
}

function getDealStatus(id) {
  const d = _readDossier(id);
  if (!d) return 'quote';
  return _toCanon(d.status) || computeDealStatus(d);
}

/* Atualiza colunas próprias de dossiers (status/created_by/assigned_to).
   Update com retry em vez de upsert: a linha pode ainda não existir (o sync
   jsonb do storage.js é debounced) e um upsert criaria a linha com data nulo. */
function _updateColumns(id, cols, attempt = 0) {
  if (!SUPABASE_ENABLED || !supabase) return;
  supabase.from('dossiers').update(cols).eq('id', id).select('id')
    .then(({ data, error }) => {
      if (error) { console.warn('[deal-status] colunas dossiers:', error.message); return; }
      if ((!data || !data.length) && attempt < 3) {
        setTimeout(() => _updateColumns(id, cols, attempt + 1), 3000);
      }
    });
}

/* ── Persistência da transição + deal_timeline (A3.1) ────────────────────── */
async function setDealStatus(id, to, opts = {}) {
  if (!CANON.includes(to)) return false;
  const d = _readDossier(id);
  if (!d) return false;
  const from = _toCanon(d.status);
  if (from === to) return false;

  const u = await _getUser();
  d.status = to;
  d.statusChangedAt = _now();
  if (!Array.isArray(d.statusHistory)) d.statusHistory = [];
  d.statusHistory.push({ from, to, at: d.statusChangedAt, by: (u && u.email) || null });
  if (d.statusHistory.length > 100) d.statusHistory = d.statusHistory.slice(-100);
  _writeDossier(id, d);

  if (SUPABASE_ENABLED && supabase) {
    _updateColumns(id, { status: to });
    supabase.from('deal_timeline').insert({
      dossier_id: id, from_status: from, to_status: to,
      user_email: (u && u.email) || null, user_id: (u && u.id) || null,
    }).then(({ error }) => { if (error) console.warn('[deal-status] timeline:', error.message); });
  }

  try {
    document.dispatchEvent(new CustomEvent('deal-status-changed', { detail: { id, from, to, source: opts.source || null } }));
  } catch (e) {}
  // A2.1: log da mudança de status
  if (typeof window.__logEvent === 'function')
    window.__logEvent('STATUS_CHANGE', 'ticketing', { entity_id: id, field_changed: 'status', old_value: from, new_value: to });
  return true;
}

/* Reconcilia o persistido com o derivado dos sinais. Não rebaixa o status
   persistido (sinais podem ainda não estar hidratados), exceto com override. */
function reconcileDealStatus(id, opts = {}) {
  const d = _readDossier(id);
  if (!d) return null;
  const computed  = computeDealStatus(d);
  const persisted = _toCanon(d.status);
  const hasOverride = !!_toCanon(d.statusOverride);
  let next = computed;
  if (persisted && !hasOverride && RANK[persisted] > RANK[computed]) next = persisted;
  if (next !== persisted) setDealStatus(id, next, opts);
  return next;
}

/* ── A9.1/A9.2 — created_by/assigned_to automáticos no deal novo ─────────── */
async function initNewDeal(id) {
  const d = _readDossier(id);
  if (!d || d.createdBy) return;
  const u = await _getUser();
  d.createdBy  = { id: (u && u.id) || null, email: (u && u.email) || null, at: _now() };
  d.assignedTo = { id: (u && u.id) || null, email: (u && u.email) || null };
  d.assignmentHistory = [{ from: null, to: (u && u.email) || null, at: _now(), by: (u && u.email) || null }];
  if (!_toCanon(d.status)) {
    d.status = 'quote';
    d.statusChangedAt = _now();
    if (!Array.isArray(d.statusHistory)) d.statusHistory = [];
    d.statusHistory.push({ from: null, to: 'quote', at: d.statusChangedAt, by: (u && u.email) || null });
  }
  _writeDossier(id, d);

  if (SUPABASE_ENABLED && supabase) {
    _updateColumns(id, { status: d.status, created_by: (u && u.id) || null, assigned_to: (u && u.id) || null });
    supabase.from('deal_timeline').insert({
      dossier_id: id, from_status: null, to_status: 'quote',
      user_email: (u && u.email) || null, user_id: (u && u.id) || null,
    }).then(() => {});
    supabase.from('deal_assignments').insert({
      dossier_id: id, assigned_from: null, assigned_to: (u && u.id) || null,
      by_user_email: (u && u.email) || null,
    }).then(() => {});
  }
  // A2.1: log da criação do deal
  if (typeof window.__logEvent === 'function')
    window.__logEvent('CREATE', 'ticketing', { entity_id: id, new_value: 'quote' });
}

/* ── Gatilhos: watcher de escritas no localStorage ───────────────────────── */
// dossiers novos têm id 'dos_<epoch-ms>' — só considera "novo" se recente,
// para não carimbar created_by do usuário atual em dossiers legados.
function _isFreshDealId(id) {
  const m = /^dos_(\d{12,})$/.exec(id || '');
  return !!m && (Date.now() - Number(m[1])) < 60000;
}

const _pending = {};
function _scheduleReconcile(id, opts) {
  if (!id) return;
  clearTimeout(_pending[id]);
  _pending[id] = setTimeout(() => {
    delete _pending[id];
    try { reconcileDealStatus(id, opts); } catch (e) { console.warn('[deal-status] reconcile:', e); }
  }, 300);
}

function _onPaymentsWrite(sref) {
  const id = _idFromRef(sref);
  if (!id) return;
  const before = getDealStatus(id);
  clearTimeout(_pending[id]);
  _pending[id] = setTimeout(() => {
    delete _pending[id];
    const after = reconcileDealStatus(id, { source: 'payment' }) || getDealStatus(id);
    // 1.3/8.2: pagamento dispara awaiting_payment → ticketing + aba TICKETS
    if (after === 'ticketing' && before !== 'ticketing' && before !== 'ticketed') {
      try {
        if (localStorage.getItem('expatur_booked_' + id) !== '1') {
          localStorage.setItem('expatur_booked_' + id, '1'); // destrava as abas
        }
        if (_activeId() === id) {
          if (typeof window._applyBookingTabState === 'function') window._applyBookingTabState();
          const sec = document.getElementById('section-quoting');
          const visible = sec && sec.offsetParent !== null;
          if (visible && typeof window.quotingSwitch === 'function') {
            window.quotingSwitch('billet');
            _toast('Paiement enregistré — passage à l’onglet Tickets', 'success');
          } else {
            _toast('Paiement enregistré — deal en émission (onglet Tickets débloqué)', 'success');
          }
        }
      } catch (e) {}
    }
  }, 300);
}

/* A2.1: log de invoice/pagamento (financeiro), deduplicado para não poluir o
   Journal com os re-saves do sync. invoice: 1× por ref; payment: por nº de
   pagamentos (loga só quando aumenta). */
const _finSeen = { invoice: new Set(), paymentCount: {} };
function _logFinanceWrite(kind, sref, value) {
  if (typeof window.__logEvent !== 'function') return;
  const id = _idFromRef(sref);
  try {
    if (kind === 'invoice') {
      if (_finSeen.invoice.has(sref)) return;
      _finSeen.invoice.add(sref);
      window.__logEvent('UPDATE', 'financeiro', { entity_id: id || sref, field_changed: 'invoice_emise' });
    } else {
      const arr = typeof value === 'string' ? JSON.parse(value) : value;
      const n = Array.isArray(arr) ? arr.filter(p => (Number(p && p.amount) || 0) > 0).length : 0;
      if (n <= (_finSeen.paymentCount[sref] || 0)) { _finSeen.paymentCount[sref] = n; return; }
      _finSeen.paymentCount[sref] = n;
      window.__logEvent('UPDATE', 'financeiro', { entity_id: id || sref, field_changed: 'paiement', new_value: 'paiement #' + n });
    }
  } catch (e) {}
}

function _installWatcher() {
  if (Storage.prototype.__dealStatusWatcher__) return;
  const _prevSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const r = _prevSet.apply(this, arguments);
    if (this !== localStorage || typeof key !== 'string') return r;
    try {
      if (key.startsWith('expatur_dossier_') && key !== 'expatur_dossier_list') {
        const id = key.slice('expatur_dossier_'.length);
        const d = typeof value === 'string' ? JSON.parse(value) : null;
        if (d && !Array.isArray(d)) {
          _indexDossierRef(id, d);
          if (!d.createdBy && _isFreshDealId(id)) setTimeout(() => initNewDeal(id), 0);
          else if (!_toCanon(d.status)) _scheduleReconcile(id); // legado: persiste canônico
        }
      } else if (key.startsWith('expatur_payments_')) {
        const sref = key.slice('expatur_payments_'.length);
        _onPaymentsWrite(sref);
        _logFinanceWrite('payment', sref, value);
      } else if (key.startsWith('expatur_em_invoice_')) {
        const sref = key.slice('expatur_em_invoice_'.length);
        _scheduleReconcile(_idFromRef(sref), { source: 'invoice' });
        _logFinanceWrite('invoice', sref, value);
      } else if (key.startsWith('expatur_booked_')) {
        _scheduleReconcile(key.slice('expatur_booked_'.length), { source: 'payout' });
      } else if (key.startsWith('billetFrozen_')) {
        _scheduleReconcile(_idFromRef(key.slice('billetFrozen_'.length)), { source: 'emit' });
      }
    } catch (e) {}
    return r;
  };
  Storage.prototype.__dealStatusWatcher__ = true;
}

// ÉMETTRE: reconcilia o dossier ativo logo após a emissão (além do watcher)
function _hookEmettre() {
  const fn = window.emettreBillet;
  if (typeof fn !== 'function' || fn.__dealStatusHook__) return typeof fn === 'function';
  const wrapped = function () {
    const r = fn.apply(this, arguments);
    const id = _activeId();
    if (id) _scheduleReconcile(id, { source: 'emit' });
    return r;
  };
  wrapped.__dealStatusHook__ = true;
  window.emettreBillet = wrapped;
  return true;
}

/* ── Migração do legado (coluna dossiers.status, criada com default quote) ── */
async function _migrateStatusColumn() {
  if (!SUPABASE_ENABLED || !supabase) return;
  if (localStorage.getItem(MIGRATION_FLAG) === '1') return;
  const byStatus = { quote: [], awaiting_payment: [], ticketing: [], ticketed: [] };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('expatur_dossier_') || k === 'expatur_dossier_list') continue;
      const id = k.slice('expatur_dossier_'.length);
      const d = _readJSON(k, null);
      if (!d || Array.isArray(d)) continue;
      byStatus[_toCanon(d.status) || computeDealStatus(d)].push(id);
    }
  } catch (e) {}
  // Apenas a coluna, em lotes — o jsonb (data.status) é persistido lazy pelo
  // reconcile na primeira escrita natural de cada dossier (evita ~930 syncs).
  try {
    for (const st of CANON) {
      const ids = byStatus[st];
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('dossiers')
          .update({ status: st }).in('id', ids.slice(i, i + 100));
        if (error) throw error;
      }
    }
    localStorage.setItem(MIGRATION_FLAG, '1');
    const n = CANON.reduce((a, s) => a + byStatus[s].length, 0);
    console.info(`[deal-status] coluna dossiers.status migrada para o vocabulário canônico (${n} dossiers).`);
  } catch (e) {
    console.warn('[deal-status] migração da coluna status falhou (tenta no próximo login):', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Painel direito — Timeline + Commentaires (A3.1/A3.2/A3.3)
   ══════════════════════════════════════════════════════════════════════════ */
function _label(st) {
  const lang = (typeof window.currentLang === 'string' ? window.currentLang : 'fr');
  return (lang === 'pt' ? LABELS_PT : LABELS_FR)[st] || st || '—';
}

function _ensurePanelDom() {
  if (document.getElementById('deal-tlc-panel')) return;
  const sec = document.getElementById('section-quoting');
  if (!sec) return;

  const btn = document.createElement('button');
  btn.id = 'deal-tlc-toggle';
  btn.type = 'button';
  btn.innerHTML = '🕑 Historique';
  btn.style.display = 'none';
  btn.onclick = () => toggleDealPanel();
  sec.appendChild(btn);

  const panel = document.createElement('aside');
  panel.id = 'deal-tlc-panel';
  panel.innerHTML =
    '<div class="tlc-head">'
    + '<span>Timeline &amp; Commentaires</span>'
    + '<button type="button" class="tlc-close" onclick="window.dealPanelClose()">✕</button>'
    + '</div>'
    + '<div class="tlc-body">'
    + '<div class="tlc-sec-title">Assignation</div>'
    + '<div id="tlc-assign" class="tlc-assign"><div class="tlc-empty">—</div></div>'
    + '<div class="tlc-sec-title">Timeline du statut</div>'
    + '<div id="tlc-timeline" class="tlc-timeline"><div class="tlc-empty">Chargement…</div></div>'
    + '<div class="tlc-sec-title">Commentaires</div>'
    + '<div id="tlc-comments" class="tlc-comments"><div class="tlc-empty">Chargement…</div></div>'
    + '</div>'
    + '<div class="tlc-foot">'
    + '<textarea id="tlc-input" rows="2" placeholder="Écrire un commentaire…"></textarea>'
    + '<button type="button" class="btn btn-navy" onclick="window.dealPanelSendComment()">Envoyer</button>'
    + '</div>';
  sec.appendChild(panel);

  const input = panel.querySelector('#tlc-input');
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); window.dealPanelSendComment(); }
  });
}

function _injectPanelCss() {
  const css = document.createElement('style');
  css.textContent = `
#deal-tlc-toggle { position:fixed; right:0; top:42%; z-index:340; background:var(--navy,#06203B);
  color:#fff; border:none; border-radius:8px 0 0 8px; padding:0.55rem 0.7rem; font-size:0.7rem;
  font-weight:700; cursor:pointer; writing-mode:vertical-rl; letter-spacing:0.08em;
  box-shadow:-4px 2px 14px rgba(6,32,59,0.25); }
#deal-tlc-toggle:hover { background:#0a3158; }
#deal-tlc-panel { position:fixed; top:0; right:-440px; width:min(420px,92vw); height:100vh;
  background:#fff; box-shadow:-12px 0 40px rgba(6,32,59,0.18); z-index:350;
  transition:right 0.25s ease; display:flex; flex-direction:column; }
#deal-tlc-panel.open { right:0; }
#deal-tlc-panel .tlc-head { background:var(--navy,#06203B); color:#fff; padding:0.85rem 1.1rem;
  display:flex; align-items:center; justify-content:space-between; font-weight:700; font-size:0.85rem; }
#deal-tlc-panel .tlc-close { background:none; border:none; color:#fff; font-size:1rem; cursor:pointer; }
#deal-tlc-panel .tlc-body { flex:1; overflow-y:auto; padding:0.9rem 1.1rem; }
#deal-tlc-panel .tlc-sec-title { font-size:0.6rem; letter-spacing:0.14em; text-transform:uppercase;
  color:rgba(6,32,59,0.55); font-weight:800; margin:0.9rem 0 0.5rem; }
#deal-tlc-panel .tlc-sec-title:first-child { margin-top:0; }
#deal-tlc-panel .tlc-empty { font-size:0.74rem; color:rgba(6,32,59,0.45); padding:0.4rem 0; }
.tlc-tl-item { display:flex; gap:0.55rem; padding:0.45rem 0; border-bottom:1px solid rgba(6,32,59,0.07);
  font-size:0.74rem; align-items:baseline; }
.tlc-tl-item .tlc-dot { width:8px; height:8px; border-radius:50%; background:var(--gold,#C9A227); flex-shrink:0; position:relative; top:1px; }
.tlc-tl-item .tlc-meta { color:rgba(6,32,59,0.5); font-size:0.66rem; display:block; }
.tlc-msg { margin:0.45rem 0; padding:0.5rem 0.65rem; background:rgba(6,32,59,0.05);
  border-radius:10px; font-size:0.76rem; }
.tlc-msg.mine { background:rgba(201,162,39,0.14); }
.tlc-msg .tlc-author { font-weight:700; font-size:0.64rem; color:var(--navy,#06203B); }
.tlc-msg .tlc-when { font-size:0.62rem; color:rgba(6,32,59,0.45); margin-left:0.4rem; font-weight:400; }
.tlc-msg .tlc-text { white-space:pre-wrap; word-break:break-word; margin-top:0.15rem; }
#deal-tlc-panel .tlc-foot { border-top:1px solid rgba(6,32,59,0.1); padding:0.7rem 1.1rem;
  display:flex; gap:0.5rem; align-items:flex-end; }
#deal-tlc-panel .tlc-foot textarea { flex:1; resize:none; border:1px solid rgba(6,32,59,0.18);
  border-radius:8px; padding:0.45rem 0.6rem; font-size:0.76rem; font-family:inherit; }
#deal-tlc-panel .tlc-foot button { padding:0.5rem 0.9rem; font-size:0.72rem; }
.tlc-assign { font-size:0.76rem; }
.tlc-assign .tlc-assign-cur { color:rgba(6,32,59,0.7); }
.tlc-assign select { width:100%; margin-top:0.35rem; border:1px solid rgba(6,32,59,0.18);
  border-radius:8px; padding:0.4rem 0.5rem; font-size:0.76rem; font-family:inherit; background:#fff; }`;
  document.head.appendChild(css);
}

function _fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso || ''; }
}

async function _renderTimeline(id) {
  const host = document.getElementById('tlc-timeline');
  if (!host) return;
  let rows = [];
  if (SUPABASE_ENABLED && supabase) {
    try {
      const { data } = await supabase.from('deal_timeline')
        .select('from_status, to_status, user_email, created_at')
        .eq('dossier_id', id).order('created_at', { ascending: false }).limit(100);
      rows = data || [];
    } catch (e) {}
  }
  if (!rows.length) {
    // fallback: histórico local espelhado no jsonb
    const d = _readDossier(id);
    rows = ((d && d.statusHistory) || []).slice().reverse()
      .map(h => ({ from_status: h.from, to_status: h.to, user_email: h.by, created_at: h.at }));
  }
  host.innerHTML = rows.length
    ? rows.map(r =>
        '<div class="tlc-tl-item"><span class="tlc-dot"></span><div>'
        + '<strong>' + _esc(r.from_status ? _label(r.from_status) + ' → ' : '') + _esc(_label(r.to_status)) + '</strong>'
        + '<span class="tlc-meta">' + _esc(_fmtWhen(r.created_at)) + (r.user_email ? ' · ' + _esc(r.user_email) : '') + '</span>'
        + '</div></div>').join('')
    : '<div class="tlc-empty">Aucune transition enregistrée.</div>';
}

async function _renderComments(id) {
  const host = document.getElementById('tlc-comments');
  if (!host) return;
  let rows = [];
  if (SUPABASE_ENABLED && supabase) {
    try {
      const { data } = await supabase.from('deal_comments')
        .select('author_email, author_name, body, created_at')
        .eq('dossier_id', id).order('created_at', { ascending: true }).limit(200);
      rows = data || [];
    } catch (e) {}
  }
  const me = (_user && _user.email) || '';
  host.innerHTML = rows.length
    ? rows.map(r =>
        '<div class="tlc-msg' + (r.author_email === me ? ' mine' : '') + '">'
        + '<span class="tlc-author">' + _esc(r.author_name || r.author_email) + '</span>'
        + '<span class="tlc-when">' + _esc(_fmtWhen(r.created_at)) + '</span>'
        + '<div class="tlc-text">' + _esc(r.body) + '</div>'
        + '</div>').join('')
    : '<div class="tlc-empty">Aucun commentaire.</div>';
  host.scrollTop = host.scrollHeight;
}

/* ── A9.3 — Reatribuição manual ──────────────────────────────────────────── */
// admin reatribui qualquer deal; quem tem can_assign_deals só os próprios.
function _isMyDeal(d) {
  const me = (window.__perm && window.__perm.userId) || null;
  if (!me || !d) return false;
  return (d.createdBy && d.createdBy.id === me) || (d.assignedTo && d.assignedTo.id === me);
}
function _canReassign(d) {
  const p = window.__perm;
  if (!p) return false;
  if (p.isAdmin) return true;
  return !!p.canAssign && _isMyDeal(d);
}

function _renderAssign(id) {
  const host = document.getElementById('tlc-assign');
  if (!host) return;
  const d = _readDossier(id);
  const cur = d && d.assignedTo;
  const curEmail = (cur && cur.email) || null;
  const curLine = '<div class="tlc-assign-cur">Assigné à : <strong>' + _esc(curEmail || '—') + '</strong></div>';

  if (!_canReassign(d)) { host.innerHTML = curLine; return; }

  const users = window.__usersList || [];
  const curId = (cur && cur.id) || '';
  // garante que o assignee atual aparece na lista mesmo sem __usersList carregado
  const opts = users.slice();
  if (curId && !opts.some(u => u.id === curId)) opts.unshift({ id: curId, email: curEmail || curId });
  host.innerHTML = curLine
    + '<select onchange="window.dealReassign(\'' + _esc(id) + '\', this.value)">'
    + (curId ? '' : '<option value="">— Choisir —</option>')
    + opts.map(u => '<option value="' + _esc(u.id) + '"' + (u.id === curId ? ' selected' : '') + '>' + _esc(u.email) + '</option>').join('')
    + '</select>';
}

async function reassignDeal(id, toUserId) {
  if (!id || !toUserId) return;
  const d = _readDossier(id);
  if (!d || !_canReassign(d)) { _toast('Réattribution non autorisée', 'error'); return; }
  const users = window.__usersList || [];
  const target = users.find(u => u.id === toUserId);
  const toEmail = (target && target.email) || null;
  const fromId = (d.assignedTo && d.assignedTo.id) || null;
  const fromEmail = (d.assignedTo && d.assignedTo.email) || null;
  if (fromId === toUserId) return;

  const u = await _getUser();
  d.assignedTo = { id: toUserId, email: toEmail };
  if (!Array.isArray(d.assignmentHistory)) d.assignmentHistory = [];
  d.assignmentHistory.push({ from: fromEmail, to: toEmail, at: _now(), by: (u && u.email) || null });
  if (d.assignmentHistory.length > 100) d.assignmentHistory = d.assignmentHistory.slice(-100);
  _writeDossier(id, d);

  if (SUPABASE_ENABLED && supabase) {
    _updateColumns(id, { assigned_to: toUserId });
    supabase.from('deal_assignments').insert({
      dossier_id: id, assigned_from: fromId, assigned_to: toUserId,
      by_user_email: (u && u.email) || null,
    }).then(({ error }) => { if (error) console.warn('[deal-status] assignment:', error.message); });
  }
  // A2.1: log da reatribuição
  if (typeof window.__logEvent === 'function')
    window.__logEvent('ASSIGN', 'ticketing', { entity_id: id, field_changed: 'assigned_to', old_value: fromEmail, new_value: toEmail });
  _toast('Deal réattribué à ' + (toEmail || toUserId), 'success');
  _renderAssign(id);
}

async function refreshDealPanel() {
  const id = _activeId();
  if (!id) return;
  await _getUser();
  _renderAssign(id);
  await Promise.all([_renderTimeline(id), _renderComments(id)]);
}

function toggleDealPanel(force) {
  _ensurePanelDom();
  const panel = document.getElementById('deal-tlc-panel');
  if (!panel) return;
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if (open) refreshDealPanel();
}

async function sendDealComment() {
  const id = _activeId();
  const input = document.getElementById('tlc-input');
  const body = (input && input.value || '').trim();
  if (!id || !body) return;
  if (!SUPABASE_ENABLED || !supabase) { _toast('Supabase indisponible', 'error'); return; }
  const u = await _getUser();
  if (!u || !u.email) { _toast('Session expirée — reconnectez-vous', 'error'); return; }
  const { error } = await supabase.from('deal_comments').insert({
    dossier_id: id, author_email: u.email,
    author_name: (u.email.split('@')[0] || u.email), body,
  });
  if (error) { _toast('Erreur: ' + error.message, 'error'); return; }
  input.value = '';
  _renderComments(id);
}

// A3.3 — botão visível apenas quando o deal ativo é ticketed
function _syncPanelVisibility() {
  _ensurePanelDom();
  const btn = document.getElementById('deal-tlc-toggle');
  const panel = document.getElementById('deal-tlc-panel');
  if (!btn) return;
  const sec = document.getElementById('section-quoting');
  if (!sec || sec.offsetParent === null) {           // seção oculta: botão some junto
    if (panel) panel.classList.remove('open');
    return;
  }
  const id = _activeId();
  // A3.3: timeline/comments a partir de ticketed; A9.3: ou quando pode reatribuir
  const show = !!id && (getDealStatus(id) === 'ticketed' || _canReassign(_readDossier(id)));
  btn.style.display = show ? '' : 'none';
  if (!show && panel) panel.classList.remove('open');
}

function _hookPanelTriggers() {
  ['quotingSwitch', 'switchDossier', '_dossierLoad'].forEach((name) => {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__dealPanelHook__) return;
    const wrapped = function () {
      const r = fn.apply(this, arguments);
      setTimeout(_syncPanelVisibility, 50);
      return r;
    };
    wrapped.__dealPanelHook__ = true;
    window[name] = wrapped;
  });
  document.addEventListener('deal-status-changed', (ev) => {
    if (ev.detail && ev.detail.id === _activeId()) setTimeout(_syncPanelVisibility, 0);
  });
  // permissões carregadas/alteradas (permissions.js) → reavalia botão e painel
  document.addEventListener('perm-loaded', () => {
    setTimeout(() => {
      _syncPanelVisibility();
      const panel = document.getElementById('deal-tlc-panel');
      if (panel && panel.classList.contains('open')) refreshDealPanel();
    }, 0);
  });
}

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
function _init() {
  _installWatcher();
  _injectPanelCss();
  _hookPanelTriggers();
  let tries = 0;
  const t = setInterval(() => { if (_hookEmettre() || ++tries > 20) clearInterval(t); }, 500);
  // safety: navegações internas do app.js não passam pelos wrappers de window
  setInterval(_syncPanelVisibility, 3000);

  if (SUPABASE_ENABLED && supabase) {
    try {
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) _user = { id: session.user.id, email: session.user.email || null };
          // após a hidratação do storage.js (que corre no applySession)
          setTimeout(_migrateStatusColumn, 4000);
          setTimeout(_syncPanelVisibility, 1500);
        }
        if (event === 'SIGNED_OUT') _user = null;
      });
    } catch (e) {}
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();

/* ── API global ──────────────────────────────────────────────────────────── */
window.DEAL_STATUS = {
  CANON, LABELS_FR, LABELS_PT,
  get: getDealStatus,
  set: setDealStatus,
  compute: computeDealStatus,
  reconcile: reconcileDealStatus,
  label: _label,
};
window.dealPanelToggle      = toggleDealPanel;
window.dealPanelClose       = () => toggleDealPanel(false);
window.dealPanelRefresh     = refreshDealPanel;
window.dealPanelSendComment = sendDealComment;
window.dealReassign         = reassignDeal;
