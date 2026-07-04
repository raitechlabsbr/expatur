/**
 * system-log.js — Log geral de alterações + painel Journal (spec A2 — Fase 7)
 *
 * - Tabela `system_log` (migration 004): imutável (sem update/delete), insert
 *   por qualquer autenticado, leitura apenas por admin (is_admin via 007).
 * - Logging central: window.__logEvent(action_type, module, opts) — usado por
 *   auth.js (LOGIN/LOGOUT), deal-status.js (CREATE/STATUS_CHANGE/ASSIGN),
 *   permissions.js (PERMISSION_CHANGE), documents.js (UPLOAD/DELETE) e pelos
 *   sinais de invoice/pagamento (UPDATE financeiro) capturados aqui.
 * - Estrutura A2.2: timestamp UTC, user_id/email, action_type, module,
 *   entity_id, field_changed, old_value, new_value, ip_address (best-effort).
 * - Painel "Journal" no Gestion utilisateurs com filtros (usuário, módulo,
 *   tipo, datas, entity_id), somente leitura (A2.3).
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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

// IP do cliente — best-effort, uma vez por sessão (cacheado). Sem edge function
// não há IP confiável no servidor; o valor é informativo/auditável.
let _ip;
async function _getIp() {
  if (_ip !== undefined) return _ip;
  try { const c = sessionStorage.getItem('__client_ip'); if (c != null) { _ip = c; return _ip; } } catch (e) {}
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    _ip = j && j.ip ? String(j.ip) : '';
  } catch (e) { _ip = ''; }
  try { sessionStorage.setItem('__client_ip', _ip); } catch (e) {}
  return _ip;
}

async function logEvent(action_type, module, opts = {}) {
  if (!SUPABASE_ENABLED || !supabase || !action_type || !module) return;
  try {
    const u = await _getUser();
    const row = {
      user_id:       (u && u.id) || null,
      user_email:    (u && u.email) || null,
      action_type,
      module,
      entity_id:     opts.entity_id != null ? String(opts.entity_id) : null,
      field_changed: opts.field_changed || null,
      old_value:     opts.old_value != null ? String(opts.old_value) : null,
      new_value:     opts.new_value != null ? String(opts.new_value) : null,
      ip_address:    (await _getIp()) || null,
    };
    const { error } = await supabase.from('system_log').insert(row);
    if (error) console.warn('[system-log]', error.message);
  } catch (e) {}
}
window.__logEvent = logEvent;

/* ── Login / logout centralizados via onAuthStateChange ──────────────────── */
function _hookAuthEvents() {
  if (!SUPABASE_ENABLED || !supabase) return;
  try {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        if (session?.user) _user = { id: session.user.id, email: session.user.email || null };
        logEvent('LOGIN', 'usuarios', { entity_id: session?.user?.id });
      } else if (event === 'SIGNED_OUT') {
        // LOGOUT é logado de forma síncrona em auth.js (_logout) antes do reload;
        // aqui apenas limpamos o usuário em cache.
        _user = null;
      }
    });
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════════════
   Painel Journal (A2.3) — somente admin (RLS garante)
   ══════════════════════════════════════════════════════════════════════════ */
const MODULES = ['', 'ticketing', 'financeiro', 'clientes', 'tarefas', 'fornecedores', 'vendedores', 'programas', 'usuarios', 'documentos'];
const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'ASSIGN', 'UPLOAD', 'PERMISSION_CHANGE', 'LOGIN', 'LOGOUT'];

function _ensureJournalDom() {
  if (document.getElementById('journal-card')) return true;
  const body = document.querySelector('#admin-panel .admin-body');
  if (!body) return false;
  const card = document.createElement('div');
  card.className = 'admin-card';
  card.id = 'journal-card';
  card.style.marginTop = '1rem';
  const opt = (arr) => arr.map(v => '<option value="' + v + '">' + (v || '— tous —') + '</option>').join('');
  card.innerHTML =
    '<h4>Journal — log général</h4>'
    + '<div class="admin-row" style="flex-wrap:wrap;gap:0.4rem;align-items:flex-end;">'
    + '<input id="jr-user" class="db-input" type="text" placeholder="Utilisateur (email)" style="max-width:170px;">'
    + '<select id="jr-module" class="db-input" style="max-width:130px;">' + opt(MODULES) + '</select>'
    + '<select id="jr-action" class="db-input" style="max-width:150px;">' + opt(ACTIONS) + '</select>'
    + '<input id="jr-entity" class="db-input" type="text" placeholder="entity_id" style="max-width:130px;">'
    + '<input id="jr-from" class="db-input" type="date" title="Du" style="max-width:140px;">'
    + '<input id="jr-to" class="db-input" type="date" title="Au" style="max-width:140px;">'
    + '<button class="btn btn-navy btn-sm" type="button" onclick="window.__renderJournal()">Filtrer</button>'
    + '<button class="admin-mini-btn" type="button" onclick="window.__journalClear()">Effacer</button>'
    + '</div>'
    + '<div id="jr-body" class="admin-hint" style="margin-top:0.6rem;overflow:auto;">Loading…</div>';
  body.appendChild(card);
  return true;
}

window.__journalClear = function () {
  ['jr-user', 'jr-entity', 'jr-from', 'jr-to'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  ['jr-module', 'jr-action'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  window.__renderJournal();
};

function _fmtWhen(iso) {
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso || ''; }
}

async function renderJournal() {
  if (!_ensureJournalDom()) return;
  const box = document.getElementById('jr-body');
  if (!box) return;
  box.innerHTML = 'Loading…';
  if (!SUPABASE_ENABLED || !supabase) { box.innerHTML = 'Supabase non configuré.'; return; }

  const v = (id) => (document.getElementById(id)?.value || '').trim();
  try {
    let q = supabase.from('system_log')
      .select('created_at, user_email, action_type, module, entity_id, field_changed, old_value, new_value, ip_address')
      .order('created_at', { ascending: false }).limit(200);
    if (v('jr-user'))   q = q.ilike('user_email', '%' + v('jr-user') + '%');
    if (v('jr-module')) q = q.eq('module', v('jr-module'));
    if (v('jr-action')) q = q.eq('action_type', v('jr-action'));
    if (v('jr-entity')) q = q.eq('entity_id', v('jr-entity'));
    if (v('jr-from'))   q = q.gte('created_at', v('jr-from'));
    if (v('jr-to'))     q = q.lte('created_at', v('jr-to') + 'T23:59:59.999Z');
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) { box.innerHTML = '<div class="admin-hint">Aucune entrée.</div>'; return; }
    box.innerHTML = '<table class="admin-table" style="font-size:0.7rem;"><thead><tr>'
      + '<th>Date</th><th>Utilisateur</th><th>Action</th><th>Module</th><th>Entité</th><th>Champ</th><th>Ancien → Nouveau</th><th>IP</th>'
      + '</tr></thead><tbody>'
      + rows.map(r => {
          const chg = (r.old_value != null || r.new_value != null)
            ? _esc(r.old_value || '∅') + ' → ' + _esc(r.new_value || '∅') : '';
          return '<tr>'
            + '<td style="white-space:nowrap;">' + _esc(_fmtWhen(r.created_at)) + '</td>'
            + '<td>' + _esc(r.user_email || '') + '</td>'
            + '<td>' + _esc(r.action_type) + '</td>'
            + '<td>' + _esc(r.module) + '</td>'
            + '<td>' + _esc(r.entity_id || '') + '</td>'
            + '<td>' + _esc(r.field_changed || '') + '</td>'
            + '<td>' + chg + '</td>'
            + '<td>' + _esc(r.ip_address || '') + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table>';
  } catch (e) {
    box.innerHTML = '<div class="admin-hint">Lecture réservée aux administrateurs (' + _esc(e.message || '') + ').</div>';
  }
}
window.__renderJournal = renderJournal;

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
function _init() { _hookAuthEvents(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();
