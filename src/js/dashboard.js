/**
 * dashboard.js — Welcome page: widget TÂCHES (3 colonnes) + Vols de la semaine
 * (spec 5.1 / 5.2 — Fase 8)
 *
 * - 5.1 TÂCHES em 3 colunas (Aujourd'hui / Demain / Prochains jours = 7 dias);
 *   pendentes no topo, concluídas abaixo (acinzentadas com ✓); clicar abre o
 *   modal de detalhe (window.openTaskDetail) — SEM redirecionar (corrige o bug).
 * - 5.2 Vols de la semaine: somente deals `ticketed` (status canônico) com PNR
 *   confirmado, semana corrente (lun→dim); card com origem, destino, data, PNR
 *   e companhia (logo IATA quando disponível).
 *
 * Reaproveita o store canônico de tarefas (window.getAllTasks) e o status
 * canônico (window.DEAL_STATUS). Re-renderiza por cima do welcomeRefresh do
 * app.js (hook em window.welcomeRefresh + window.sidebarGo + observer).
 */

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function _readJSON(k, fb) {
  try { const s = localStorage.getItem(k); return s == null ? fb : JSON.parse(s); } catch (e) { return fb; }
}
function _sanit(ref) { return String(ref || '').replace(/[^a-zA-Z0-9]/g, '_'); }

function _d0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function _addDays(d, n) { const r = new Date(d); r.setDate(d.getDate() + n); return r; }
function _fmtDate(d) {
  try { return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); } catch (e) { return ''; }
}

/* ── Enumeração dos dossiers (fonte canônica: localStorage espelhado) ─────── */
function _allDossiers() {
  const out = [];
  const list = _readJSON('expatur_dossier_list', []) || [];
  const seen = {};
  list.forEach((entry) => {
    const id = entry && (entry.id != null ? String(entry.id) : null);
    if (!id || seen[id]) return;
    seen[id] = true;
    const d = _readJSON('expatur_dossier_' + id, null);
    if (!d || Array.isArray(d)) return;
    const ref = (d.fields && d.fields['booking-ref']) || entry.label || id;
    out.push({ id, ref: String(ref || '').trim(), fields: d.fields || {}, tripType: d.tripType || 'oneway', multiLegs: d.multiLegs || [] });
  });
  return out;
}

/* ── 5.1 — TÂCHES em 3 colunas ───────────────────────────────────────────── */
function _tasks() {
  try { if (typeof window.getAllTasks === 'function') return window.getAllTasks() || []; } catch (e) {}
  return [];
}
function _taskDue(t) {
  const v = t.dueDate || t.due || '';
  if (!v) return null;
  const d = new Date(v); if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0); return d;
}
function _taskDone(t) { return t.status === 'done' || t.done === true; }

function _renderTasks() {
  const host = document.getElementById('welcome-tasks-today');
  if (!host) return;
  host.style.display = 'grid';
  host.style.visibility = 'visible';
  host.style.opacity = '1';

  const t0 = _d0(), t1 = _addDays(t0, 1), tEnd = _addDays(t0, 7);
  const buckets = { today: [], tomorrow: [], upcoming: [] };
  _tasks().forEach((t) => {
    const due = _taskDue(t); if (!due) return;
    const ms = due.getTime();
    if (ms <= t0.getTime()) buckets.today.push(t);          // hoje + atrasadas (não some)
    else if (ms === t1.getTime()) buckets.tomorrow.push(t);
    else if (ms > t1.getTime() && ms <= tEnd.getTime()) buckets.upcoming.push(t);
  });

  const card = (t) => {
    const done = _taskDone(t);
    const prio = (t.priority || t.prio || 'normal');
    const prioColor = prio === 'haute' || prio === 'high' ? 'var(--red)' : 'var(--navy)';
    const title = _esc(t.title || t.text || '(tâche)');
    const cat = _esc(t.category || t.cat || 'Diversos');
    const ref = _esc(t._ref || t.ref || '');
    const base = 'padding:0.42rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);font-size:0.74rem;cursor:pointer;';
    const style = done ? base + 'opacity:0.5;' : base;
    return '<div style="' + style + '" onclick="window.__dashOpenTask(\'' + _esc(String(t.id)) + '\')">'
      + '<div style="font-weight:700;font-size:0.78rem;color:' + (done ? 'var(--navy-soft)' : prioColor) + ';' + (done ? 'text-decoration:line-through;' : '') + '">'
      + (done ? '✓ ' : '') + title + '</div>'
      + '<div style="font-size:0.66rem;color:var(--navy-soft);">' + cat + (ref ? ' · <span style="font-family:monospace;">' + ref + '</span>' : '') + '</div>'
      + '</div>';
  };

  const col = (label, items, accent) => {
    items.sort((a, b) => (_taskDone(a) ? 1 : 0) - (_taskDone(b) ? 1 : 0)); // pendentes no topo
    return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;min-height:80px;">'
      + '<div style="padding:0.35rem 0.5rem;background:' + accent + ';font-size:0.55rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#fff;">'
      + label + ' <span style="opacity:0.7;font-size:0.65em;">(' + items.length + ')</span></div>'
      + (items.length === 0
          ? '<div style="padding:0.7rem 0.5rem;font-size:0.72rem;color:var(--navy-faint);font-style:italic;">—</div>'
          : items.map(card).join(''))
      + '</div>';
  };

  host.innerHTML =
    col("Aujourd'hui", buckets.today, '#d80505') +
    col('Demain', buckets.tomorrow, '#06203b') +
    col('Prochains jours', buckets.upcoming, '#b69249');
}

// clique no card → modal de detalhe, sem redirecionar (5.1)
window.__dashOpenTask = function (id) {
  if (typeof window.openTaskDetail === 'function') { try { window.openTaskDetail(id); return; } catch (e) {} }
  if (typeof window.openTaskInTarefas === 'function') { try { window.openTaskInTarefas(id); } catch (e) {} }
};

/* ── 5.2 — Vols de la semaine (ticketed + PNR, semana corrente) ──────────── */
function _billet(ref) { return _readJSON('expatur_billet_' + _sanit(ref), null); }

function _dealStatus(id) {
  try { if (window.DEAL_STATUS && typeof window.DEAL_STATUS.get === 'function') return window.DEAL_STATUS.get(id); } catch (e) {}
  return null;
}

function _legs(d) {
  const f = d.fields || {};
  const legs = [];
  const dep1 = f['dep1'] || '', arr1 = f['arr1'] || '', dt1 = f['date-leg1'] || f['date1'] || '';
  if (dep1 && dt1) legs.push({ dep: dep1, arr: arr1 || '?', dateStr: dt1, airline: f['airline'] || f['carrier'] || '' });
  if (d.tripType === 'return') {
    const dep2 = f['dep2'] || arr1, arr2 = f['arr2'] || dep1, dt2 = f['date-leg2'] || f['date2'] || '';
    if (dep2 && dt2) legs.push({ dep: dep2, arr: arr2, dateStr: dt2, airline: f['airline'] || f['carrier'] || '' });
  }
  (d.multiLegs || []).forEach((leg) => {
    if (leg.dep && leg.date) legs.push({ dep: leg.dep, arr: leg.arr || '?', dateStr: leg.date, airline: (leg.sel && leg.sel.airline) || '' });
  });
  return legs;
}

// PNR de um deal a partir do registro de billet (masterPnr → leg → pax)
function _pnrOf(bil, legIndex) {
  if (!bil) return '';
  if (bil.masterPnr) return bil.masterPnr;
  if (Array.isArray(bil.legs) && bil.legs[legIndex] && bil.legs[legIndex].pnr) return bil.legs[legIndex].pnr;
  if (Array.isArray(bil.legs)) { const l = bil.legs.find(x => x && x.pnr); if (l) return l.pnr; }
  if (Array.isArray(bil.pax)) { const p = bil.pax.find(x => x && x.pnr); if (p) return p.pnr; }
  return '';
}

function _airlineLogo(code) {
  if (!code) return '';
  const c = String(code).toUpperCase();
  return '<img src="/assets/airlines/' + c + '.svg" alt="' + c + '" style="height:14px;width:auto;vertical-align:middle;margin-right:4px;" '
    + 'onerror="this.style.display=\'none\'">';
}

function _renderFlights() {
  const host = document.getElementById('welcome-flights-week');
  if (!host) return;

  // Convergência (spec §6): se o board Vols já carregou, o widget lê dele
  // (fonte única). Semana corrente lun→dim, agrupada como hoje.
  const board = Array.isArray(window._volsRows) ? window._volsRows : null;
  if (board) {
    const t0b = _d0();
    const dowb = (t0b.getDay() + 6) % 7;
    const weekStartB = _addDays(t0b, -dowb), weekEndB = _addDays(weekStartB, 6);
    const yestB = _addDays(t0b, -1), tomB = _addDays(t0b, 1);
    const bk = { hier: [], aujourd_hui: [], demain: [], prochains: [] };
    board.forEach((r) => {
      const dt = (window._volsParseDate ? window._volsParseDate(r.flight_date) : new Date(r.flight_date));
      if (!dt || isNaN(dt.getTime())) return;
      if (dt.getTime() < weekStartB.getTime() || dt.getTime() > weekEndB.getTime()) return;
      const f = { ref: r.dossier_ref || r.pnr || '', pax: r.client || r.dossier_ref || '—',
        dep: r.dep_code, arr: r.arr_code, date: dt, pnr: r.pnr, airline: '', airlineCode: '' };
      const t = dt.getTime();
      if (t === yestB.getTime()) bk.hier.push(f);
      else if (t === t0b.getTime()) bk.aujourd_hui.push(f);
      else if (t === tomB.getTime()) bk.demain.push(f);
      else bk.prochains.push(f);
    });
    const cardB = (f) =>
      '<div data-dossier-ref="' + _esc(f.ref) + '" style="padding:0.45rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);font-size:0.74rem;cursor:pointer;">'
      + '<div style="font-weight:600;color:var(--navy);font-size:0.76rem;">' + _esc(f.dep) + ' → ' + _esc(f.arr) + '</div>'
      + '<div style="font-size:0.66rem;color:var(--navy-soft);margin-top:2px;">' + _fmtDate(f.date) + '</div>'
      + '<div style="font-size:0.66rem;color:var(--navy-soft);font-family:monospace;">PNR ' + _esc(f.pnr || '—') + ' · ' + _esc(f.pax) + '</div>'
      + '</div>';
    const colB = (label, flights, accent) =>
      '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;min-height:80px;">'
      + '<div style="padding:0.35rem 0.5rem;background:' + accent + ';font-size:0.55rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#fff;">'
      + label + ' <span style="opacity:0.7;font-size:0.65em;">(' + flights.length + ')</span></div>'
      + (flights.length === 0
          ? '<div style="padding:0.7rem 0.5rem;font-size:0.72rem;color:var(--navy-faint);font-style:italic;">—</div>'
          : flights.sort((a, b) => a.date - b.date).map(cardB).join(''))
      + '</div>';
    host.innerHTML =
      colB('Hier', bk.hier, '#8a9db5') +
      colB("Aujourd'hui", bk.aujourd_hui, '#d80505') +
      colB('Demain', bk.demain, '#06203b') +
      colB('Prochains jours', bk.prochains, '#b69249');
    return;   // fonte única: não cair na derivação por bookings
  }
  // (abaixo: derivação legada por bookings — fallback enquanto o board não carregou)

  // semana corrente: segunda → domingo
  const t0 = _d0();
  const dow = (t0.getDay() + 6) % 7; // 0 = lundi
  const weekStart = _addDays(t0, -dow);
  const weekEnd = _addDays(weekStart, 6);

  const buckets = { hier: [], aujourd_hui: [], demain: [], prochains: [] };
  const yest = _addDays(t0, -1), tom = _addDays(t0, 1);

  _allDossiers().forEach((d) => {
    if (_dealStatus(d.id) !== 'ticketed') return;          // 5.2: só ticketed
    const bil = _billet(d.ref);
    const masterPnr = _pnrOf(bil, 0);
    if (!masterPnr && !(bil && Array.isArray(bil.legs) && bil.legs.some(l => l && l.pnr))) return; // PNR confirmado
    const pax = (d.fields && d.fields['pax-name-1']) || d.ref || '—';

    _legs(d).forEach((leg, i) => {
      const dt = new Date(leg.dateStr); dt.setHours(0, 0, 0, 0);
      if (isNaN(dt.getTime())) return;
      if (dt.getTime() < weekStart.getTime() || dt.getTime() > weekEnd.getTime()) return; // semana corrente
      const pnr = _pnrOf(bil, i) || masterPnr;
      const airlineCode = (typeof window.getAirlineLogoCode === 'function')
        ? (window.getAirlineLogoCode(leg.airline) || '') : '';
      const f = { ref: d.ref, pax, dep: leg.dep, arr: leg.arr, date: dt, pnr, airline: leg.airline, airlineCode };
      const t = dt.getTime();
      if (t === yest.getTime()) buckets.hier.push(f);
      else if (t === t0.getTime()) buckets.aujourd_hui.push(f);
      else if (t === tom.getTime()) buckets.demain.push(f);
      else buckets.prochains.push(f);
    });
  });

  const card = (f) => {
    const logo = _airlineLogo(f.airlineCode);
    const comp = f.airline ? _esc(f.airline) : (f.airlineCode ? _esc(f.airlineCode) : '');
    return '<div style="padding:0.45rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);font-size:0.74rem;">'
      + '<div style="font-weight:600;color:var(--navy);font-size:0.76rem;">' + logo + _esc(f.dep) + ' → ' + _esc(f.arr) + '</div>'
      + '<div style="font-size:0.66rem;color:var(--navy-soft);margin-top:2px;">' + _fmtDate(f.date)
      + (comp ? ' · ' + comp : '') + '</div>'
      + '<div style="font-size:0.66rem;color:var(--navy-soft);font-family:monospace;">PNR ' + _esc(f.pnr || '—') + ' · ' + _esc(f.ref) + '</div>'
      + '</div>';
  };
  const col = (label, flights, accent) =>
    '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;min-height:80px;">'
    + '<div style="padding:0.35rem 0.5rem;background:' + accent + ';font-size:0.55rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#fff;">'
    + label + ' <span style="opacity:0.7;font-size:0.65em;">(' + flights.length + ')</span></div>'
    + (flights.length === 0
        ? '<div style="padding:0.7rem 0.5rem;font-size:0.72rem;color:var(--navy-faint);font-style:italic;">—</div>'
        : flights.sort((a, b) => a.date - b.date).map(card).join(''))
    + '</div>';

  host.innerHTML =
    col('Hier', buckets.hier, '#8a9db5') +
    col("Aujourd'hui", buckets.aujourd_hui, '#d80505') +
    col('Demain', buckets.demain, '#06203b') +
    col('Prochains jours', buckets.prochains, '#b69249');
}

/* ── Orquestração ────────────────────────────────────────────────────────── */
function enhanceDashboard() {
  const sec = document.getElementById('section-welcome');
  if (!sec) return;
  try { _renderTasks(); } catch (e) { console.warn('[dashboard] tâches:', e); }
  try { _renderFlights(); } catch (e) { console.warn('[dashboard] vols:', e); }
}
window.__enhanceDashboard = enhanceDashboard;

function _hook(name) {
  const fn = window[name];
  if (typeof fn !== 'function' || fn.__dashHook__) return;
  const wrapped = function () {
    const r = fn.apply(this, arguments);
    setTimeout(enhanceDashboard, 30);
    return r;
  };
  wrapped.__dashHook__ = true;
  window[name] = wrapped;
}

/* ── 7.1 — fallback do embed B2B (se o site bloquear via X-Frame-Options) ─── */
function _setupB2B() {
  const iframe = document.getElementById('b2b-iframe');
  const fb = document.getElementById('b2b-fallback');
  if (!iframe || !fb || iframe.__b2bWired) return;
  iframe.__b2bWired = true;
  let loaded = false;
  iframe.addEventListener('load', () => { loaded = true; fb.style.display = 'none'; });
  iframe.addEventListener('error', () => { fb.style.display = 'flex'; });
  // se em 7s o onload não disparou, provavelmente foi bloqueado
  setTimeout(() => { if (!loaded) fb.style.display = 'flex'; }, 7000);
}

function _init() {
  _setupB2B();
  let tries = 0;
  const t = setInterval(() => {
    _hook('welcomeRefresh');
    _hook('sidebarGo');
    if ((window.welcomeRefresh && window.welcomeRefresh.__dashHook__) || ++tries > 30) clearInterval(t);
  }, 500);
  // primeira renderização
  setTimeout(enhanceDashboard, 1500);
  // segurança: navegações internas que não passam pelos wrappers de window —
  // observa a seção welcome ganhar 'open' (sem polling, sem flicker)
  const sec = document.getElementById('section-welcome');
  if (sec && window.MutationObserver) {
    let wasOpen = sec.classList.contains('open');
    new MutationObserver(() => {
      const open = sec.classList.contains('open');
      if (open && !wasOpen) setTimeout(enhanceDashboard, 30);
      wasOpen = open;
    }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();
