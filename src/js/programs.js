/**
 * programs.js — Menu PROGRAMAS (spec A5 + A7.2)
 *
 * - Tabela `programs` no Supabase é a fonte única dos programas de fidelidade.
 * - Alimenta dinamicamente a coluna Programme do Cost Calculator
 *   (window.__setMilesIssuers, definido em app.js) e adiciona o grupo
 *   "Programas" ao dropdown Fournisseur (A7.2 — optgroups).
 * - A cada emissão (ÉMETTRE), grava as linhas do Cost Calculator em
 *   `program_emissions` vinculadas ao programa/deal/vendedor (A5.4/A5.5).
 * - Página PROGRAMAS: dashboard top-5 por volume de milhas (A5.6), tabela
 *   ordenável (A5.7) e detalhe com as passagens emitidas (A5.8).
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

const CACHE_KEY = 'expatur_programs_cache';
const FALLBACK = ['Smiles','Copa','Latam Pass','Latam Tabela Fixa','Air France','APM',
                  'Azul Fidelidade','QR Privilege Club','Consolidator','VISA / E.T.A','Volta Cancelada'];

let _programs  = [];   // rows da tabela programs
let _emissions = [];   // cache da última busca de program_emissions
let _dbReady   = false;
let _sortCol   = 'name';
let _sortDir   = 1;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function _fmtInt(n)  { return (Number(n)||0).toLocaleString('pt-BR'); }
function _fmtBRL(n)  { return 'R$ ' + (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _toast(msg, kind) { if (typeof window.toast === 'function') window.toast(msg, kind || 'success'); }

function _activeNames() {
  return _programs.filter(p => p.active !== false).map(p => p.name);
}

/* ── Carregamento ────────────────────────────────────────────────────────── */
async function loadPrograms() {
  // cache primeiro (boot instantâneo)
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (Array.isArray(c) && c.length) { _programs = c; _applyToCostCalc(); }
  } catch (e) {}

  if (!SUPABASE_ENABLED || !supabase) return;
  try {
    const { data, error } = await supabase.from('programs').select('*').order('name');
    if (error) throw error;
    _dbReady  = true;
    _programs = data || [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_programs)); } catch (e) {}
    _applyToCostCalc();
  } catch (e) {
    // tabela ainda não migrada — segue com fallback hardcoded
    console.warn('[programs] tabela programs indisponível (migration 001 aplicada?):', e.message);
    if (!_programs.length) _programs = FALLBACK.map(n => ({ name: n, active: true }));
    _applyToCostCalc();
  }
}

async function _fetchEmissions() {
  if (!_dbReady || !supabase) { _emissions = []; return; }
  try {
    const { data, error } = await supabase
      .from('program_emissions')
      .select('id, program_name, dossier_id, dossier_ref, volume_miles, cpm_brl, taxas_brl, extra_brl, subtotal_brl, pnr, vendedor, emitted_at')
      .order('emitted_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    _emissions = data || [];
  } catch (e) {
    console.warn('[programs] erro ao buscar emissões:', e.message);
    _emissions = [];
  }
}

/* ── Integração com o Cost Calculator (A5.3 + A7.2) ──────────────────────── */
function _applyToCostCalc() {
  window.EXPATUR_PROGRAMS = _programs;   // lido por onMilesIssuerChange (presets)
  const names = _activeNames();
  if (!names.length) return;
  if (typeof window.__setMilesIssuers === 'function') window.__setMilesIssuers(names);

  // Atualiza selects Programme já abertos, preservando a seleção
  document.querySelectorAll('[id^="mc-sel-"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = names.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join('');
    if (cur && names.includes(cur)) sel.value = cur;
  });

  _appendProgramsGroupToFournisseur();
}

// A7.2: dropdown Fournisseur = fornecedores (já populado pelo app) + grupo Programas
function _appendProgramsGroupToFournisseur() {
  const names = _activeNames();
  document.querySelectorAll('[id^="mc-forn-"], [id^="bl-cost-forn-"]').forEach(sel => {
    if (sel.querySelector('optgroup[data-programs]')) {
      sel.querySelector('optgroup[data-programs]').remove();
    }
    const og = document.createElement('optgroup');
    og.label = 'Programas';
    og.setAttribute('data-programs', '1');
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
}

// Reaplica o grupo quando o app re-popula os selects (troca de aba couts)
function _hookFournisseurRefresh() {
  ['dvSwitch', 'quotingSwitch'].forEach(fn => {
    const prev = window[fn];
    if (typeof prev !== 'function' || prev.__progFornHook) return;
    const w = function (tab) {
      const r = prev.apply(this, arguments);
      if (tab === 'couts') setTimeout(_appendProgramsGroupToFournisseur, 60);
      return r;
    };
    w.__progFornHook = true;
    window[fn] = w;
  });
}

/* ── Registro de emissões (A5.4/A5.5) ────────────────────────────────────── */
function _collectMilesRows() {
  const rows = [];
  document.querySelectorAll('#miles-rows .miles-row-wrap').forEach(r => {
    const id  = r.id.replace('miles-row-', '');
    const sel = document.getElementById('mc-sel-' + id);
    if (!sel || !sel.value) return;
    const num = eid => parseFloat((document.getElementById(eid) || {}).value) || 0;
    const subTxt = (document.getElementById('mc-sub-' + id) || {}).textContent || '';
    const subtotal = parseFloat(subTxt.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.')) || 0;
    rows.push({
      program_name: sel.value,
      volume_miles: num('mc-vol-' + id),
      cpm_brl:      num('mc-cpm-' + id),
      taxas_brl:    num('mc-fee-' + id),
      extra_brl:    num('mc-ext-' + id),
      subtotal_brl: subtotal,
    });
  });
  return rows.filter(r => r.volume_miles > 0 || r.subtotal_brl > 0);
}

function _getPnrForRef(ref) {
  try {
    const raw = localStorage.getItem('expatur_billet_' + String(ref).replace(/[^a-zA-Z0-9]/g, '_'));
    if (!raw) return '';
    const b = JSON.parse(raw);
    if (b.masterPnr) return b.masterPnr;
    const pnrs = (b.legs || []).map(l => l.pnr).filter(Boolean);
    return pnrs.join(' · ');
  } catch (e) { return ''; }
}

async function recordEmissions() {
  if (!_dbReady || !supabase) return;
  const dossierId = localStorage.getItem('expatur_active_dossier') || '';
  const ref       = (document.getElementById('booking-ref') || {}).value || '';
  const vendedor  = (document.getElementById('vendeur-select') || {}).value || '';
  const rows      = _collectMilesRows();
  if (!dossierId || !rows.length) return;

  // dedupe: não regrava se as linhas não mudaram desde a última emissão deste deal
  const hash = JSON.stringify(rows);
  const hkey = 'expatur_pe_hash_' + dossierId;
  if (localStorage.getItem(hkey) === hash) return;

  const pnr = _getPnrForRef(ref);
  let userId = null;
  try { userId = (await supabase.auth.getUser()).data?.user?.id || null; } catch (e) {}

  const payload = rows.map(r => ({
    ...r,
    dossier_id:  dossierId,
    dossier_ref: ref,
    pnr,
    vendedor,
    created_by:  userId,
  }));
  try {
    const { error } = await supabase.from('program_emissions').insert(payload);
    if (error) throw error;
    try { localStorage.setItem(hkey, hash); } catch (e) {}
    console.info(`[programs] ${payload.length} emissão(ões) registrada(s) para ${ref || dossierId}.`);
  } catch (e) {
    console.warn('[programs] falha ao registrar emissões:', e.message);
  }
}

function _hookEmettre() {
  const prev = window.emettreBillet;
  if (typeof prev !== 'function' || prev.__progEmitHook) return false;
  const w = function () {
    const r = prev.apply(this, arguments);
    // após os wrappers do app persistirem o billet/dossier
    setTimeout(() => { recordEmissions(); }, 500);
    return r;
  };
  w.__progEmitHook = true;
  window.emettreBillet = w;
  return true;
}

/* ── Página PROGRAMAS ────────────────────────────────────────────────────── */
function _aggByProgram() {
  const agg = {};
  _programs.forEach(p => { agg[p.name] = { name: p.name, count: 0, miles: 0, active: p.active !== false, row: p }; });
  _emissions.forEach(e => {
    if (!agg[e.program_name]) agg[e.program_name] = { name: e.program_name, count: 0, miles: 0, active: false, row: null };
    agg[e.program_name].count += 1;
    agg[e.program_name].miles += Number(e.volume_miles) || 0;
  });
  return Object.values(agg);
}

function _renderDashboard(agg) {
  const top5 = agg.filter(a => a.miles > 0).sort((a, b) => b.miles - a.miles).slice(0, 5);
  const host = document.getElementById('prog-dashboard');
  if (!host) return;
  if (!top5.length) {
    host.innerHTML = '<p style="color:var(--navy-faint);font-style:italic;font-size:0.8rem;margin:0 0 1rem;">Nenhuma emissão registrada ainda — o ranking aparece a partir da primeira emissão.</p>';
    return;
  }
  const max = top5[0].miles || 1;
  host.innerHTML =
    '<div style="font-size:0.62rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--navy-faint);margin-bottom:0.6rem;">Top 5 — volume de milhas emitidas</div>'
    + top5.map((p, i) =>
      '<div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.45rem;">'
      + `<span style="flex:0 0 1.4rem;font-weight:800;color:var(--gold);font-size:0.85rem;">${i + 1}º</span>`
      + `<span style="flex:0 0 160px;font-weight:700;color:var(--navy);font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(p.name)}</span>`
      + '<div style="flex:1;background:rgba(6,32,59,0.07);border-radius:5px;height:18px;overflow:hidden;">'
      + `<div style="width:${Math.max(4, Math.round(p.miles / max * 100))}%;height:100%;background:linear-gradient(90deg,var(--navy),#1d4ed8);border-radius:5px;"></div></div>`
      + `<span style="flex:0 0 110px;text-align:right;font-weight:700;font-size:0.78rem;color:var(--navy);">${_fmtInt(p.miles)} mi</span>`
      + '</div>').join('');
}

function _renderTable(agg) {
  const tbody = document.getElementById('prog-table-body');
  if (!tbody) return;
  const q = ((document.getElementById('prog-search') || {}).value || '').toLowerCase().trim();
  let rows = agg.filter(a => !q || a.name.toLowerCase().includes(q));
  rows.sort((a, b) => {
    const va = _sortCol === 'name' ? a.name.toLowerCase() : a[_sortCol];
    const vb = _sortCol === 'name' ? b.name.toLowerCase() : b[_sortCol];
    return (va > vb ? 1 : va < vb ? -1 : 0) * _sortDir;
  });
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--navy-faint);font-style:italic;padding:1.2rem;">Nenhum programa encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(p =>
    `<tr style="cursor:pointer;" onclick="programasOpenDetail('${_esc(p.name).replace(/'/g, "\\'")}')">`
    + `<td style="font-weight:700;color:var(--navy);">${_esc(p.name)}${p.active === false ? ' <span style="font-size:0.6rem;color:#dc2626;">(inativo)</span>' : ''}</td>`
    + `<td style="text-align:right;">${_fmtInt(p.count)}</td>`
    + `<td style="text-align:right;font-weight:600;">${_fmtInt(p.miles)}</td>`
    + '<td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">'
    + (p.row ? `<button class="btn btn-navy btn-sm" style="font-size:0.6rem;padding:2px 8px;" onclick="programasEdit(${p.row.id ?? 'null'})">✎</button> `
             + `<button class="btn btn-sm" style="font-size:0.6rem;padding:2px 8px;background:rgba(220,38,38,0.08);color:#dc2626;border:1px solid rgba(220,38,38,0.3);border-radius:5px;cursor:pointer;" onclick="programasDelete(${p.row.id ?? 'null'})">×</button>` : '')
    + '</td></tr>').join('');
}

async function programasRender() {
  await loadPrograms();
  await _fetchEmissions();
  const agg = _aggByProgram();
  _renderDashboard(agg);
  _renderTable(agg);
  const hint = document.getElementById('prog-db-hint');
  if (hint) hint.style.display = _dbReady ? 'none' : '';
}

function programasSort(col) {
  if (_sortCol === col) _sortDir = -_sortDir; else { _sortCol = col; _sortDir = col === 'name' ? 1 : -1; }
  _renderTable(_aggByProgram());
}

/* ── Detalhe do programa (A5.8) ──────────────────────────────────────────── */
function programasOpenDetail(name) {
  const panel = document.getElementById('prog-detail');
  if (!panel) return;
  const from = (document.getElementById('prog-det-from') || {}).value || '';
  const to   = (document.getElementById('prog-det-to')   || {}).value || '';
  let list = _emissions.filter(e => e.program_name === name);
  if (from) list = list.filter(e => e.emitted_at >= from);
  if (to)   list = list.filter(e => e.emitted_at <= to + 'T23:59:59');

  const totMiles = list.reduce((s, e) => s + (Number(e.volume_miles) || 0), 0);
  document.getElementById('prog-detail-title').textContent = name;
  document.getElementById('prog-detail-sub').textContent =
    `${list.length} emissão(ões) · ${_fmtInt(totMiles)} milhas`;
  panel.dataset.program = name;

  const tbody = document.getElementById('prog-detail-body');
  tbody.innerHTML = list.length ? list.map(e =>
    '<tr>'
    + `<td><span style="color:var(--navy);font-weight:700;text-decoration:underline;cursor:pointer;" onclick="programasOpenDeal('${_esc(e.dossier_id)}')">${_esc(e.dossier_ref || e.dossier_id)}</span></td>`
    + `<td style="text-align:right;">${_fmtInt(e.volume_miles)}</td>`
    + `<td>${_esc(e.pnr || '—')}</td>`
    + `<td>${_esc(e.program_name)}</td>`
    + `<td style="text-align:right;">${_fmtBRL(e.subtotal_brl)}</td>`
    + `<td style="white-space:nowrap;">${new Date(e.emitted_at).toLocaleDateString('pt-BR')}</td>`
    + `<td>${_esc(e.vendedor || '—')}</td>`
    + '</tr>').join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--navy-faint);font-style:italic;padding:1rem;">Nenhuma emissão no período.</td></tr>';

  panel.classList.add('open');
}

function programasCloseDetail() {
  const panel = document.getElementById('prog-detail');
  if (panel) panel.classList.remove('open');
}

function programasDetailFilter() {
  const panel = document.getElementById('prog-detail');
  if (panel && panel.dataset.program) programasOpenDetail(panel.dataset.program);
}

function programasOpenDeal(dossierId) {
  if (!dossierId) return;
  programasCloseDetail();
  if (localStorage.getItem('expatur_dossier_' + dossierId) && typeof window.switchDossier === 'function') {
    window.switchDossier(dossierId);
  } else {
    _toast('Dossier não disponível neste dispositivo', 'error');
  }
}

/* ── CRUD (A5.2) ─────────────────────────────────────────────────────────── */
function _openProgForm(row) {
  const wrap = document.getElementById('prog-form-wrap');
  if (!wrap) return;
  wrap.style.display = '';
  wrap.dataset.editId = row ? row.id : '';
  document.getElementById('prog-f-name').value  = row ? row.name       : '';
  document.getElementById('prog-f-cpm').value   = row && row.cpm   != null ? row.cpm   : '';
  document.getElementById('prog-f-fee').value   = row && row.fee   != null ? row.fee   : '';
  document.getElementById('prog-f-extra').value = row && row.extra != null ? row.extra : '';
  document.getElementById('prog-f-title').textContent = row ? `Modifier — ${row.name}` : 'Novo programa';
  document.getElementById('prog-f-name').focus();
}

async function programasSave() {
  if (!_dbReady || !supabase) { _toast('Aplique a migration 001 no Supabase primeiro', 'error'); return; }
  const wrap = document.getElementById('prog-form-wrap');
  const name = (document.getElementById('prog-f-name') || {}).value?.trim();
  if (!name) { _toast('Nome obrigatório', 'error'); return; }
  const numOrNull = id => {
    const v = (document.getElementById(id) || {}).value;
    return v === '' || v == null ? null : parseFloat(v);
  };
  const payload = { name, cpm: numOrNull('prog-f-cpm'), fee: numOrNull('prog-f-fee'),
                    extra: numOrNull('prog-f-extra'), updated_at: new Date().toISOString() };
  try {
    const editId = wrap.dataset.editId;
    const { error } = editId
      ? await supabase.from('programs').update(payload).eq('id', editId)
      : await supabase.from('programs').insert(payload);
    if (error) throw error;
    wrap.style.display = 'none';
    _toast(editId ? 'Programa atualizado' : 'Programa criado');
    await programasRender();   // recarrega + reaplica no Cost Calculator (tempo real, A5.3)
  } catch (e) {
    _toast('Erro: ' + e.message, 'error');
  }
}

function programasEdit(id) {
  const row = _programs.find(p => p.id === id);
  if (row) _openProgForm(row);
}

async function programasDelete(id) {
  if (!_dbReady || !supabase) return;
  const row = _programs.find(p => p.id === id);
  if (!row) return;
  const emCount = _emissions.filter(e => e.program_name === row.name).length;
  // A5.2: programa com emissões vinculadas exige confirmação explícita;
  // o histórico (program_emissions) nunca é apagado.
  const msg = emCount
    ? `"${row.name}" tem ${emCount} emissão(ões) vinculada(s). O histórico será mantido, mas o programa sai da lista. Excluir mesmo assim?`
    : `Excluir o programa "${row.name}"?`;
  if (!confirm(msg)) return;
  if (emCount && !confirm('Confirmação final: excluir "' + row.name + '"?')) return;
  try {
    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) throw error;
    _toast('Programa excluído');
    await programasRender();
  } catch (e) {
    _toast('Erro: ' + e.message, 'error');
  }
}

/* ── Estilos do drawer de detalhe ────────────────────────────────────────── */
(function _injectCss() {
  const css = document.createElement('style');
  css.textContent = `
#prog-detail { position:fixed; top:0; right:-720px; width:min(700px,94vw); height:100vh;
  background:#fff; box-shadow:-12px 0 40px rgba(6,32,59,0.18); z-index:360;
  transition:right 0.25s ease; display:flex; flex-direction:column; }
#prog-detail.open { right:0; }
#prog-detail .pd-head { background:var(--navy,#06203B); color:#fff; padding:1rem 1.25rem;
  display:flex; align-items:center; gap:0.8rem; }
#prog-detail table { width:100%; border-collapse:collapse; font-size:0.76rem; }
#prog-detail th { text-align:left; font-size:0.58rem; letter-spacing:0.12em; text-transform:uppercase;
  color:rgba(6,32,59,0.5); padding:0.5rem 0.6rem; border-bottom:2px solid rgba(6,32,59,0.1); }
#prog-detail td { padding:0.45rem 0.6rem; border-bottom:1px solid rgba(6,32,59,0.07); }
#section-programas .prog-th { cursor:pointer; user-select:none; }
#section-programas .prog-th:hover { color:var(--navy); }`;
  document.head.appendChild(css);
})();

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
function _init() {
  _hookEmettre();
  _hookFournisseurRefresh();
  loadPrograms();
  // retry do hook caso emettreBillet seja (re)definido depois
  let tries = 0;
  const t = setInterval(() => { if (_hookEmettre() || ++tries > 20) clearInterval(t); }, 500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();

/* ── API global (chamada por sidebarGo e onclicks do HTML) ───────────────── */
window.programasRender       = programasRender;
window.programasSearch       = () => _renderTable(_aggByProgram());
window.programasSort         = programasSort;
window.programasOpenDetail   = programasOpenDetail;
window.programasCloseDetail  = programasCloseDetail;
window.programasDetailFilter = programasDetailFilter;
window.programasOpenDeal     = programasOpenDeal;
window.programasNew          = () => _openProgForm(null);
window.programasEdit         = programasEdit;
window.programasDelete       = programasDelete;
window.programasSave         = programasSave;
window.programasFormClose    = () => { const w = document.getElementById('prog-form-wrap'); if (w) w.style.display = 'none'; };
window.programsRecordEmissions = recordEmissions;
