/**
 * permissions.js — Permissões por menu, dois níveis por role, atribuição e
 * visibilidade de deals (spec A1, A9.3-9.5 — Fase 6)
 *
 * Modelo de dois níveis (não há "usuário supremo"):
 *   - role `admin`  → nível superior: gerencia permissões/atribuição/
 *     visibilidade, reatribui qualquer deal, vê todos os deals, lê o Journal.
 *   - role `agent`  → usuário padrão.
 *   (backend: is_admin() na migration 007; RLS/trigger seguem essa função.)
 *
 * - A1.2 Checkboxes por módulo (permissions jsonb em profiles, migration 003):
 *   menu escondido na sidebar quando sem acesso, aplicado em tempo real via
 *   Supabase Realtime no canal profiles (sem relogin).
 * - A9.5 Painel de usuários ganha "Pode atribuir deals" (can_assign_deals) e
 *   "Visibilidade de deals" (deal_visibility: own/team/all).
 * - A9.3 Reatribuição manual: o seletor "Assigné à" no painel do deal
 *   (deal-status.js) usa window.__perm/__usersList expostos aqui; admin
 *   reatribui qualquer deal, quem tem can_assign_deals só os próprios.
 * - A9.4 Visibilidade aplicada no backend (RLS, migration 003); ao trocar o
 *   seletor, a próxima hidratação já vem filtrada pelo Postgres.
 *
 * Financeiro permanece restrito a admin (regra de negócio anterior): a checkbox
 * access_financeiro só pode restringir um admin, nunca conceder a um agent.
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

// módulo → id do botão na sidebar
const MENU_MAP = {
  access_ticketing:        'snav-quoting',
  access_bookings:         'snav-bookings',
  access_fornecedores:     'snav-fornecedores',
  access_vendedores:       'snav-vendedores',
  access_disponibilidades: 'snav-disponibilidades',
  access_tarefas:          'snav-tarefas',
  access_clientes:         'snav-clientes',
  access_financeiro:       'snav-financeiro',
};

// módulo → [rótulo, sigla] para os checkboxes do painel
const MODULES = [
  ['access_ticketing',        'Ticketing',       'TK'],
  ['access_bookings',         'Bookings',        'BK'],
  ['access_fornecedores',     'Fornecedores',    'FR'],
  ['access_vendedores',       'Vendedores',      'VD'],
  ['access_disponibilidades', 'Disponibilités',  'DP'],
  ['access_tarefas',          'Tâches',          'TA'],
  ['access_clientes',         'Clients',         'CL'],
  ['access_financeiro',       'Finance',         'FI'],
];

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function _toast(msg, kind) { if (typeof window.toast === 'function') window.toast(msg, kind || 'success'); }

/* ── Sessão / perfil corrente ────────────────────────────────────────────── */
let _session = null;          // { id, email }
let _profile = null;          // linha de profiles do usuário corrente
const _usersCache = {};       // id → linha de profiles (para o painel)

async function _getSession() {
  if (!SUPABASE_ENABLED || !supabase) return null;
  try {
    const s = (await supabase.auth.getSession()).data?.session;
    if (s?.user) return { id: s.user.id, email: s.user.email || null };
  } catch (e) {}
  return null;
}

async function _loadProfile(uid) {
  if (!SUPABASE_ENABLED || !supabase || !uid) return null;
  try {
    const { data, error } = await supabase.from('profiles')
      .select('id, email, role, is_active, permissions, can_assign_deals, deal_visibility, team_user_ids')
      .eq('id', uid).single();
    if (error) { console.warn('[permissions] perfil:', error.message); return null; }
    return data;
  } catch (e) { return null; }
}

function _publishPerm() {
  const isAdmin = (_profile && _profile.role) === 'admin';
  window.__perm = {
    userId:     _session && _session.id,
    email:      _session && _session.email,
    role:       (_profile && _profile.role) || 'agent',
    isAdmin,
    canAssign:  isAdmin || !!(_profile && _profile.can_assign_deals),
    visibility: (_profile && _profile.deal_visibility) || 'own',
    permissions: (_profile && _profile.permissions) || {},
  };
  try { document.dispatchEvent(new CustomEvent('perm-loaded', { detail: window.__perm })); } catch (e) {}
}

/* ── A1.2 — esconder menus sem acesso ────────────────────────────────────── */
function applyMenuPermissions() {
  const role  = (_profile && _profile.role) || 'agent';
  const isAdmin = role === 'admin';
  const perms = (_profile && _profile.permissions) || {};
  Object.keys(MENU_MAP).forEach((mod) => {
    const el = document.getElementById(MENU_MAP[mod]);
    if (!el) return;
    let allowed = isAdmin || perms[mod] !== false;
    // Financeiro nunca é concedido a um agent (regra de negócio anterior)
    if (mod === 'access_financeiro') allowed = isAdmin && perms[mod] !== false;
    el.style.display = allowed ? '' : 'none';
  });
}
window.__applyMenuPermissions = applyMenuPermissions;

/* ══════════════════════════════════════════════════════════════════════════
   Painel "Gestion utilisateurs" — colunas de permissões (A1.2 / A9.5)
   Substitui o corpo da tabela via hook __renderAdminUsersPanel (chamado por
   __adminFetchUsers em app.js). Editável apenas por admins.
   ══════════════════════════════════════════════════════════════════════════ */
function _visibilitySelect(uid, value, disabled) {
  const opts = [['own', 'Seuls les miens'], ['team', 'Moi + équipe'], ['all', 'Tous']];
  return '<select class="db-input perm-sel" style="font-size:0.7rem;padding:0.2rem 0.3rem;"'
    + (disabled ? ' disabled' : ' onchange="window.__permSave(\'' + uid + '\',\'deal_visibility\',this.value)"') + '>'
    + opts.map(([v, l]) => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + l + '</option>').join('')
    + '</select>';
}

function _modulesCell(uid, perms, disabled) {
  return '<div style="display:flex;flex-wrap:wrap;gap:0.25rem 0.55rem;min-width:230px;">'
    + MODULES.map(([mod, label, code]) => {
        const on = perms[mod] !== false;
        return '<label title="' + _esc(label) + '" style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.62rem;font-weight:700;color:var(--navy-soft,#3a5170);">'
          + '<input type="checkbox"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '')
          + ' onchange="window.__permSaveModule(\'' + uid + '\',\'' + mod + '\',this.checked)">' + code + '</label>';
      }).join('')
    + '</div>';
}

async function renderAdminUsersPanel() {
  const tbody = document.getElementById('admin-users-body');
  if (!tbody) return;
  const table = tbody.closest('table');
  const viewerIsAdmin = !!(window.__perm && window.__perm.isAdmin);

  tbody.innerHTML = '<tr><td colspan="8" class="admin-hint">Loading…</td></tr>';
  let users = [];
  try {
    const { data, error } = await supabase.from('profiles')
      .select('id, email, role, is_active, permissions, can_assign_deals, deal_visibility')
      .order('email');
    if (error) throw error;
    users = data || [];
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="admin-hint">Impossible de charger les utilisateurs: ' + _esc(e.message || '') + '</td></tr>';
    return;
  }

  // cabeçalho enriquecido
  if (table) {
    const thead = table.querySelector('thead');
    if (thead) thead.innerHTML = '<tr><th>Email</th><th>Rôle</th><th>Statut</th>'
      + '<th>Modules</th><th title="Peut attribuer des deals">Attrib.</th>'
      + '<th>Visibilité</th><th>Actions</th></tr>';
  }

  // banner para quem não é admin (somente leitura)
  let banner = document.getElementById('perm-readonly-hint');
  if (!viewerIsAdmin) {
    if (!banner && table) {
      banner = document.createElement('div');
      banner.id = 'perm-readonly-hint';
      banner.className = 'admin-hint';
      banner.style.marginBottom = '0.5rem';
      banner.textContent = 'Lecture seule — seuls les administrateurs gèrent les accès.';
      table.parentNode.insertBefore(banner, table);
    }
  } else if (banner) { banner.remove(); }

  tbody.innerHTML = users.map((u) => {
    _usersCache[u.id] = u;
    const uid = String(u.id);
    const email = u.email || '';
    const active = u.is_active !== false;
    const role = u.role || 'agent';
    const perms = u.permissions || {};
    const locked = !viewerIsAdmin;
    const safeEmail = email.replace(/'/g, "\\'");

    const canAssign = '<input type="checkbox"' + (u.can_assign_deals ? ' checked' : '') + (locked ? ' disabled' : '')
      + ' onchange="window.__permSave(\'' + uid + '\',\'can_assign_deals\',this.checked)">';

    const actions = locked ? '' :
        '<button class="admin-mini-btn" type="button" onclick="__resetInvite(\'' + safeEmail + '\')">Reset</button>'
      + '<button class="admin-mini-btn" type="button" onclick="window.__permSave(\'' + uid + '\',\'is_active\',' + (active ? 'false' : 'true') + ')">' + (active ? 'Disable' : 'Enable') + '</button>'
      + '<button class="admin-mini-btn" type="button" onclick="window.__permSave(\'' + uid + '\',\'role\',\'' + (role === 'admin' ? 'agent' : 'admin') + '\')">' + (role === 'admin' ? 'Make agent' : 'Make admin') + '</button>';

    return '<tr>'
      + '<td>' + _esc(email) + '</td>'
      + '<td>' + _esc(role) + '</td>'
      + '<td><span class="admin-status ' + (active ? 'active' : 'off') + '">' + (active ? 'Active' : 'Disabled') + '</span></td>'
      + '<td>' + _modulesCell(uid, perms, locked) + '</td>'
      + '<td style="text-align:center;">' + canAssign + '</td>'
      + '<td>' + _visibilitySelect(uid, u.deal_visibility || 'own', locked) + '</td>'
      + '<td style="display:flex;gap:.35rem;flex-wrap:wrap;">' + actions + '</td>'
      + '</tr>';
  }).join('') || '<tr><td colspan="8" class="admin-hint">No users found.</td></tr>';
}
window.__renderAdminUsersPanel = renderAdminUsersPanel;

/* salvar um campo escalar (can_assign_deals / deal_visibility / role / is_active) */
window.__permSave = async function (uid, field, value) {
  if (!window.__perm || !window.__perm.isAdmin) { _toast('Action réservée aux administrateurs', 'error'); return; }
  try {
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', uid);
    if (error) throw error;
    if (_usersCache[uid]) _usersCache[uid][field] = value;
    _toast('Enregistré', 'success');
    renderAdminUsersPanel();
  } catch (e) { _toast('Erreur: ' + (e.message || ''), 'error'); }
};

/* salvar uma checkbox de módulo dentro do jsonb permissions */
window.__permSaveModule = async function (uid, mod, on) {
  if (!window.__perm || !window.__perm.isAdmin) { _toast('Action réservée aux administrateurs', 'error'); return; }
  const cur = (_usersCache[uid] && _usersCache[uid].permissions) || {};
  const next = Object.assign({}, cur, { [mod]: !!on });
  try {
    const { error } = await supabase.from('profiles').update({ permissions: next }).eq('id', uid);
    if (error) throw error;
    if (_usersCache[uid]) _usersCache[uid].permissions = next;
    _toast('Enregistré', 'success');
  } catch (e) { _toast('Erreur: ' + (e.message || ''), 'error'); renderAdminUsersPanel(); }
};

/* ── Lista de usuários para o seletor "Assigné à" (A9.3, deal-status.js) ──── */
async function _loadUsersList() {
  if (!SUPABASE_ENABLED || !supabase) return;
  try {
    const { data } = await supabase.from('profiles').select('id, email').order('email');
    window.__usersList = (data || []).filter(u => u.id && u.email);
  } catch (e) {}
}

/* ── Realtime: aplica mudanças de permissão sem relogin (A1.2) ────────────── */
function _subscribeRealtime() {
  if (!SUPABASE_ENABLED || !supabase || _subscribeRealtime.__done) return;
  _subscribeRealtime.__done = true;
  try {
    supabase.channel('perm-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const row = payload.new || payload.old || {};
        if (row.id) _usersCache[row.id] = Object.assign(_usersCache[row.id] || {}, payload.new || {});
        // mudou o meu perfil → reaplica menus em tempo real
        if (_session && row.id === _session.id && payload.new) {
          _profile = payload.new;
          _publishPerm();
          applyMenuPermissions();
        }
        // painel admin aberto → re-render
        const ov = document.getElementById('admin-panel-overlay');
        if (ov && ov.classList.contains('open')) renderAdminUsersPanel();
        _loadUsersList();
      })
      .subscribe();
  } catch (e) {}
}

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
async function _load() {
  _session = await _getSession();
  if (!_session) return false;
  _profile = await _loadProfile(_session.id);
  _publishPerm();
  applyMenuPermissions();
  _loadUsersList();
  _subscribeRealtime();
  return true;
}

function _init() {
  // reaplica menus sempre que o auth.js reaplica o role (ui-fixes pode chamar)
  const origApply = window._applyRoleUI;
  window._applyRoleUI = function () {
    if (typeof origApply === 'function') { try { origApply.apply(this, arguments); } catch (e) {} }
    applyMenuPermissions();
  };

  let tries = 0;
  const t = setInterval(async () => {
    if (await _load() || ++tries > 30) clearInterval(t);
  }, 1000);

  if (SUPABASE_ENABLED && supabase) {
    try {
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) _session = { id: session.user.id, email: session.user.email || null };
          setTimeout(_load, 800);
        }
        if (event === 'SIGNED_OUT') { _session = null; _profile = null; window.__perm = null; }
      });
    } catch (e) {}
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();
