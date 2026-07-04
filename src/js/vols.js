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
  const inp = function (val, key) {
    return '<input data-fk="' + key + '" value="' + _esc(val) + '" '
      + 'style="width:100%;box-sizing:border-box;padding:3px 5px;font-size:0.72rem;border:1px solid var(--border);border-radius:4px;font-family:inherit;" />';
  };
  tb.innerHTML = _volsRows.map(function (r, i) {
    if (i === _volsEditIdx) {
      return '<tr data-edit="1" style="background:#fffbe6;">'
        + '<td>' + inp(r.flight_date, 'flight_date') + '</td>'
        + '<td>' + inp(r.flight_num, 'flight_num') + '</td>'
        + '<td>' + inp(r.dep_code, 'dep_code') + '</td>'
        + '<td>' + inp(r.dep_time, 'dep_time') + '</td>'
        + '<td>' + inp(r.arr_time, 'arr_time') + '</td>'
        + '<td>' + inp(r.arr_code, 'arr_code') + '</td>'
        + '<td>' + inp(r.pnr, 'pnr') + '</td>'
        + '<td>' + inp(r.client, 'client') + '</td>'
        + '<td style="text-align:center;white-space:nowrap;">'
        +   '<button title="Enregistrer" onclick="window._volsRowSave(' + i + ')" style="background:none;border:none;cursor:pointer;color:#15803d;font-size:1rem;line-height:1;margin-right:5px;">✓</button>'
        +   '<button title="Annuler" onclick="window._volsRowCancel()" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:1rem;line-height:1;">✕</button>'
        + '</td>'
        + '</tr>';
    }
    return '<tr data-vols-ref="' + _esc(r.dossier_ref || r.pnr || '') + '" style="cursor:pointer;">'
      + '<td>' + _esc(_fmtDate(r.flight_date)) + '</td>'
      + '<td style="font-weight:700;">' + _esc(r.flight_num || '—') + '</td>'
      + '<td>' + _esc(r.dep_code) + '</td>'
      + '<td>' + _esc(r.dep_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_code) + '</td>'
      + '<td>' + _esc(r.pnr || '—') + '</td>'
      + '<td>' + _esc(r.client || '—') + '</td>'
      + '<td style="text-align:center;white-space:nowrap;">'
      +   '<button title="Modifier" onclick="event.stopPropagation();window._volsRowEdit(' + i + ')" style="background:none;border:none;cursor:pointer;color:#06203b;font-size:0.9rem;line-height:1;margin-right:5px;">✎</button>'
      +   '<button title="Supprimer" onclick="event.stopPropagation();window._volsRowDelete(' + i + ')" style="background:none;border:none;cursor:pointer;color:#b91c1c;font-size:0.95rem;line-height:1;">✕</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}
window.volsRender = volsRender;

// ── Bootstrap: carrega ao abrir a seção pela 1ª vez ─────────────────────────
window.__volsEnsureLoaded = function () {
  if (!_volsLoaded) { volsLoad(); } else { volsRender(); }
};

// ── CRUD manual (grava no Supabase; recarrega o cache após cada escrita) ────
function _collectEditRow() {
  const tr = document.querySelector('#vols-tbody tr[data-edit="1"]');
  if (!tr) return null;
  const o = {};
  Array.prototype.forEach.call(tr.querySelectorAll('input[data-fk]'), function (el) {
    o[el.getAttribute('data-fk')] = el.value;
  });
  return o;
}

window._volsRowAdd = function () {
  if (_volsEditIdx >= 0) { alert('Terminez la ligne en cours d’édition d’abord.'); return; }
  _volsRows.unshift({ id: null, flight_date: '', flight_num: '', dep_code: '', dep_time: '', arr_code: '', arr_time: '', pnr: '', client: '', dossier_ref: '', source: 'manual', _isNew: true });
  _volsEditIdx = 0;
  volsRender();
  try { const f = document.querySelector('#vols-tbody tr[data-edit="1"] input[data-fk="flight_date"]'); if (f) f.focus(); } catch (e) {}
};

window._volsRowEdit = function (i) {
  if (_volsEditIdx >= 0 && _volsRows[_volsEditIdx] && _volsRows[_volsEditIdx]._isNew) {
    _volsRows.splice(_volsEditIdx, 1);         // descarta um add em branco abandonado
    if (i > _volsEditIdx) i--;
  }
  _volsEditIdx = i;
  volsRender();
};

window._volsRowCancel = function () {
  if (_volsEditIdx >= 0 && _volsRows[_volsEditIdx] && _volsRows[_volsEditIdx]._isNew) {
    _volsRows.splice(_volsEditIdx, 1);         // remove a linha em branco que adicionamos
  }
  _volsEditIdx = -1;
  volsRender();
};

window._volsRowSave = async function (i) {
  const o = _collectEditRow();
  if (!o) return;
  const d = _parseDate(o.flight_date);
  const rec = {
    flight_date: d ? (d.getFullYear() + '-' + _pad2(d.getMonth()+1) + '-' + _pad2(d.getDate())) : '',
    flight_num: String(o.flight_num || '').trim(),
    dep_code: String(o.dep_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3),
    dep_time: _hhmm(o.dep_time),
    arr_time: _hhmm(o.arr_time),
    arr_code: String(o.arr_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3),
    pnr: String(o.pnr || '').trim(),
    client: String(o.client || '').trim(),
  };
  if (!rec.flight_date || !rec.dep_code || !rec.arr_code) {
    alert('Date, De (DEP) et À (ARR) sont obligatoires.'); return;
  }
  const existing = _volsRows[i];
  _volsEditIdx = -1;
  if (!SUPABASE_ENABLED || !supabase) { volsRender(); return; }
  try {
    if (existing && existing.id) {
      const { error } = await supabase.from('flights').update(rec).eq('id', existing.id);
      if (error) console.warn('[vols] update', error.message);
    } else {
      const { error } = await supabase.from('flights').insert(Object.assign({ dossier_ref: '', source: 'manual' }, rec));
      if (error) console.warn('[vols] insert', error.message);
    }
  } catch (e) { console.warn('[vols] save', e); }
  await volsLoad();
};

window._volsRowDelete = async function (i) {
  const r = _volsRows[i];
  if (!r) return;
  if (!window.confirm('Supprimer ce vol ?\n' + (_fmtDate(r.flight_date) || '') + '  ' + (r.flight_num || '') + '  ' + (r.dep_code || '') + '→' + (r.arr_code || ''))) return;
  if (_volsEditIdx === i) _volsEditIdx = -1;
  if (r.id && SUPABASE_ENABLED && supabase) {
    try { const { error } = await supabase.from('flights').delete().eq('id', r.id); if (error) console.warn('[vols] delete', error.message); }
    catch (e) { console.warn('[vols] delete', e); }
  }
  await volsLoad();
};

window._volsClearAll = async function () {
  if (!window.confirm('Vider toute la liste des départs ? (action partagée sur tous les postes)')) return;
  if (SUPABASE_ENABLED && supabase) {
    // apaga tudo: delete com filtro sempre-verdadeiro (flight_date não nulo)
    try { const { error } = await supabase.from('flights').delete().not('flight_date', 'is', null); if (error) console.warn('[vols] clear', error.message); }
    catch (e) { console.warn('[vols] clear', e); }
  }
  _volsEditIdx = -1;
  await volsLoad();
};

// ── Realtime: qualquer insert/update/delete recarrega o board ao vivo ───────
function _volsSubscribeRealtime() {
  if (!SUPABASE_ENABLED || !supabase || _volsSubscribeRealtime.__done) return;
  _volsSubscribeRealtime.__done = true;
  try {
    supabase.channel('vols-flights')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, function () {
        // não recarregar no meio de uma edição inline (a linha em progresso sumiria)
        if (_volsEditIdx >= 0) return;
        volsLoad();
      })
      .subscribe();
  } catch (e) { console.warn('[vols] realtime', e); }
}
_volsSubscribeRealtime();

// ── Clique numa linha → abre o dossier correspondente (por ref; fallback PNR) ─
(function _volsDelegateRowClick() {
  document.addEventListener('click', function (e) {
    const tr = e.target.closest ? e.target.closest('#vols-tbody tr[data-vols-ref]') : null;
    if (!tr) return;
    if (tr.getAttribute('data-edit') === '1') return;    // linha em edição não navega
    const ref = tr.getAttribute('data-vols-ref');
    if (!ref) return;
    // resolve ref → dossierId varrendo a lista local (padrão de app.js:33042)
    let list = [];
    try { list = JSON.parse(localStorage.getItem('expatur_dossier_list') || '[]'); } catch (ex) {}
    let targetId = null;
    for (let i = 0; i < list.length; i++) {
      let dd = null;
      try { dd = JSON.parse(localStorage.getItem('expatur_dossier_' + list[i].id) || 'null'); } catch (ex) {}
      const dRef = (dd && dd.fields && dd.fields['booking-ref']) || list[i].label || '';
      if (dRef === ref) { targetId = list[i].id; break; }
    }
    if (targetId && typeof window.switchDossier === 'function') window.switchDossier(targetId);
    if (typeof window.sidebarGo === 'function') window.sidebarGo('index');
  });
})();
