// ═══════════════════════════════════════════════════════════════════════════
// Vols (Departures) — quadro de partidas compartilhado (backend Supabase).
// Porte da feature do monolito.html. Cache em memória hidratado do Supabase e
// mantido vivo por Realtime (padrão de permissions.js). Render síncrono.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

// ── Cache do board (já filtrado flight_date >= hoje) ────────────────────────
let _volsRows = [];
let _volsEditIdx = -1;          // índice em edição inline (Task 3); -1 = nenhum
let _volsLoaded = false;
window._volsRows = _volsRows;

// ── Helpers de data/hora/nome (portados do monólito) ────────────────────────
const _MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function _pad2(n) { return ('0' + n).slice(-2); }

// Aceita 'YYYY-MM-DD', '17JUN26' e Date; constrói SEMPRE data local (evita o
// bug de UTC que rola um dia para trás em fuso negativo e poda "hoje").
function _parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) { const x = new Date(v.getTime()); x.setHours(0,0,0,0); return isNaN(x) ? null : x; }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})([A-Za-z]{3})(\d{2})$/);
  if (m) {
    const mi = _MON.indexOf(m[2].toUpperCase());
    if (mi < 0) return null;
    const x = new Date(2000 + parseInt(m[3], 10), mi, parseInt(m[1], 10)); x.setHours(0,0,0,0);
    return isNaN(x) ? null : x;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const x = new Date(parseInt(iso[1],10), parseInt(iso[2],10)-1, parseInt(iso[3],10)); x.setHours(0,0,0,0);
    return isNaN(x) ? null : x;
  }
  const d = new Date(s); if (isNaN(d.getTime())) return null; d.setHours(0,0,0,0); return d;
}
// Normaliza hora para 'HH:MM' (billets guardam datetime completo).
function _hhmm(v) {
  v = String(v == null ? '' : v).trim(); if (!v) return '';
  const m = v.match(/(\d{1,2}):(\d{2})/); if (!m) return '';
  return _pad2(m[1]) + ':' + m[2];
}
// Sobrenome (convenção de booking: "NOM PRENOM" → primeira palavra, maiúsculo).
function _surname(full) {
  full = String(full || '').trim(); if (!full) return '';
  return full.toUpperCase().split(/\s+/)[0];
}
// 'YYYY-MM-DD' → 'DD/MM/YYYY' para display.
function _fmtDate(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
}
function _esc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Data local de hoje como 'YYYY-MM-DD' (para o filtro >= hoje na query).
function _todayISO() {
  const d = new Date(); return d.getFullYear() + '-' + _pad2(d.getMonth()+1) + '-' + _pad2(d.getDate());
}
window._volsParseDate = _parseDate;
window._volsHHMM = _hhmm;
window._volsSurname = _surname;

// ── Load: hidrata o cache do Supabase (voos de hoje em diante) ──────────────
async function volsLoad() {
  if (!SUPABASE_ENABLED || !supabase) { _volsLoaded = true; volsRender(); return; }
  try {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      .gte('flight_date', _todayISO())
      .order('flight_date', { ascending: true })
      .order('dep_time', { ascending: true });
    if (error) { console.warn('[vols] load', error.message); }
    _volsRows = (data || []);
    window._volsRows = _volsRows;
    _volsLoaded = true;
  } catch (e) { console.warn('[vols] load', e); }
  volsRender();
  try { if (window.__enhanceDashboard) window.__enhanceDashboard(); } catch (e) {}   // widget converge (Task 7)
}
window.volsLoad = volsLoad;

// ── Render da tabela (síncrono, lê o cache) ─────────────────────────────────
function volsRender() {
  const tb = document.getElementById('vols-tbody');
  if (!tb) return;
  const cnt = document.getElementById('vols-count');
  if (cnt) cnt.textContent = _volsRows.length + (_volsRows.length === 1 ? ' vol' : ' vols');

  if (!_volsRows.length && _volsEditIdx < 0) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--navy-faint);padding:1.5rem;">Aucun vol enregistré.</td></tr>';
    return;
  }
  tb.innerHTML = _volsRows.map(function (r, i) {
    // linha de leitura (a de edição vem na Task 3)
    return '<tr data-vols-ref="' + _esc(r.dossier_ref || r.pnr || '') + '" style="cursor:pointer;">'
      + '<td>' + _esc(_fmtDate(r.flight_date)) + '</td>'
      + '<td style="font-weight:700;">' + _esc(r.flight_num || '—') + '</td>'
      + '<td>' + _esc(r.dep_code) + '</td>'
      + '<td>' + _esc(r.dep_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_code) + '</td>'
      + '<td>' + _esc(r.pnr || '—') + '</td>'
      + '<td>' + _esc(r.client || '—') + '</td>'
      + '<td style="text-align:center;white-space:nowrap;color:var(--navy-faint);">—</td>'
      + '</tr>';
  }).join('');
}
window.volsRender = volsRender;

// ── Bootstrap: carrega ao abrir a seção pela 1ª vez ─────────────────────────
window.__volsEnsureLoaded = function () {
  if (!_volsLoaded) { volsLoad(); } else { volsRender(); }
};
