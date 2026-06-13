/**
 * tasks-kanban.js — Menu Tarefas: visualização Kanban com 4 funis + filtro por
 * categoria, com toggle Liste/Kanban (spec 6.2 — Fase 8)
 *
 * - 4 funis: Aujourd'hui / Demain / Cette semaine / Semaines suivantes.
 * - Filtro por categoria transversal a todos os funis; "Toutes" limpa o filtro.
 * - Card simples: apenas nome + categoria; clicar abre o detalhe
 *   (window.openTaskDetail), sem sair da página.
 * - Toggle Liste/Kanban no topo (mesmo padrão do Kanban/Tableau de Bookings);
 *   a escolha persiste em localStorage. A Lista existente (tarefasRender) é
 *   preservada — só alternamos a visibilidade.
 *
 * Reaproveita o store canônico window.getAllTasks().
 */

const VIEW_KEY = 'tarefas_view_mode';   // 'list' | 'kanban'
let _catFilter = 'all';

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function _mode() { try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch (e) { return 'list'; } }
function _setMode(m) { try { localStorage.setItem(VIEW_KEY, m); } catch (e) {} }

function _d0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function _addDays(d, n) { const r = new Date(d); r.setDate(d.getDate() + n); return r; }

function _tasks() {
  try { if (typeof window.getAllTasks === 'function') return window.getAllTasks() || []; } catch (e) {}
  return [];
}
function _due(t) {
  const v = t.dueDate || t.due || '';
  if (!v) return null;
  const d = new Date(v); if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0); return d;
}
function _done(t) { return t.status === 'done' || t.done === true; }
function _cat(t) { return t.category || t.cat || 'Diversos'; }

/* ── DOM: toggle + container do kanban ───────────────────────────────────── */
function _ensureDom() {
  const sec = document.getElementById('section-tarefas');
  if (!sec) return false;

  // toggle Liste/Kanban + filtro de categoria (na barra de ações)
  if (!document.getElementById('tk-toggle')) {
    const actions = sec.querySelector('.section-page-body');
    const bar = document.getElementById('tarefas-filter-bar');
    if (bar && bar.parentNode) {
      const wrap = document.createElement('div');
      wrap.id = 'tk-toggle';
      wrap.style.cssText = 'display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.6rem;';
      wrap.innerHTML =
        '<div style="display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;">'
        + '<button type="button" id="tk-btn-list" onclick="window.__tkSetView(\'list\')" class="tk-vbtn">Liste</button>'
        + '<button type="button" id="tk-btn-kanban" onclick="window.__tkSetView(\'kanban\')" class="tk-vbtn">Kanban</button>'
        + '</div>'
        + '<select id="tk-cat" onchange="window.__tkSetCat(this.value)" style="font-size:0.75rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:8px;background:#fff;font-family:inherit;"></select>'
        + '<button type="button" id="tk-cat-clear" onclick="window.__tkSetCat(\'all\')" style="font-size:0.7rem;padding:0.3rem 0.55rem;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;">Effacer le filtre</button>';
      bar.parentNode.insertBefore(wrap, bar);
    }
    // estilo dos botões do toggle
    if (!document.getElementById('tk-css')) {
      const css = document.createElement('style');
      css.id = 'tk-css';
      css.textContent =
        '.tk-vbtn{padding:0.35rem 0.9rem;font-size:0.74rem;font-weight:700;border:none;background:#fff;color:var(--navy);cursor:pointer;font-family:inherit;}'
        + '.tk-vbtn.active{background:var(--navy,#06203B);color:#fff;}'
        + '#tk-kanban .tk-col{border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-height:120px;}'
        + '#tk-kanban .tk-col-h{padding:0.5rem 0.6rem;font-size:0.6rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#fff;}'
        + '#tk-kanban .tk-card{margin:0.4rem;padding:0.5rem 0.6rem;border:1px solid rgba(6,32,59,0.1);border-radius:8px;background:#fff;cursor:pointer;box-shadow:0 1px 3px rgba(6,32,59,0.06);}'
        + '#tk-kanban .tk-card:hover{border-color:var(--gold,#C9A227);}'
        + '#tk-kanban .tk-card .tk-t{font-size:0.78rem;font-weight:700;color:var(--navy);}'
        + '#tk-kanban .tk-card .tk-c{font-size:0.64rem;color:var(--navy-soft);margin-top:2px;}'
        + '#tk-kanban .tk-empty{padding:0.7rem 0.6rem;font-size:0.72rem;color:var(--navy-faint);font-style:italic;}';
      document.head.appendChild(css);
    }
  }

  // container do kanban (irmão da lista)
  if (!document.getElementById('tk-kanban')) {
    const listWrap = sec.querySelector('.tarefas-list-wrap');
    if (listWrap && listWrap.parentNode) {
      const k = document.createElement('div');
      k.id = 'tk-kanban';
      k.style.cssText = 'display:none;grid-template-columns:repeat(4,1fr);gap:0.7rem;';
      listWrap.parentNode.insertBefore(k, listWrap.nextSibling);
    }
  }
  return true;
}

function _refreshCatOptions() {
  const sel = document.getElementById('tk-cat');
  if (!sel) return;
  const cats = {};
  _tasks().forEach((t) => { if (!_done(t)) cats[_cat(t)] = true; });
  const list = Object.keys(cats).sort();
  const cur = _catFilter;
  sel.innerHTML = '<option value="all">Toutes les catégories</option>'
    + list.map(c => '<option value="' + _esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + _esc(c) + '</option>').join('');
  sel.value = (cur === 'all' || list.indexOf(cur) >= 0) ? cur : 'all';
}

/* ── Render do Kanban ────────────────────────────────────────────────────── */
function renderKanban() {
  if (!_ensureDom()) return;
  _refreshCatOptions();
  const host = document.getElementById('tk-kanban');
  if (!host) return;

  const t0 = _d0(), t1 = _addDays(t0, 1);
  const dow = (t0.getDay() + 6) % 7;            // 0 = lundi
  const weekEnd = _addDays(t0, 6 - dow);        // domingo desta semana

  const b = { today: [], tomorrow: [], week: [], later: [] };
  _tasks().forEach((t) => {
    if (_done(t)) return;
    if (_catFilter !== 'all' && _cat(t) !== _catFilter) return;
    const due = _due(t);
    if (!due) { b.later.push(t); return; }               // sem data → semaines suivantes
    const ms = due.getTime();
    if (ms <= t0.getTime()) b.today.push(t);              // hoje + atrasadas
    else if (ms === t1.getTime()) b.tomorrow.push(t);
    else if (ms <= weekEnd.getTime()) b.week.push(t);
    else b.later.push(t);
  });

  const card = (t) =>
    '<div class="tk-card" onclick="window.__tkOpen(\'' + _esc(String(t.id)) + '\')">'
    + '<div class="tk-t">' + _esc(t.title || t.text || '(tâche)') + '</div>'
    + '<div class="tk-c">' + _esc(_cat(t)) + '</div>'
    + '</div>';
  const col = (label, items, accent) =>
    '<div class="tk-col"><div class="tk-col-h" style="background:' + accent + ';">'
    + label + ' (' + items.length + ')</div>'
    + (items.length ? items.map(card).join('') : '<div class="tk-empty">—</div>')
    + '</div>';

  host.innerHTML =
    col("Aujourd'hui", b.today, '#d80505') +
    col('Demain', b.tomorrow, '#06203b') +
    col('Cette semaine', b.week, '#b69249') +
    col('Semaines suivantes', b.later, '#8a9db5');
}

/* ── Alternância de visualização ─────────────────────────────────────────── */
function _applyView() {
  if (!_ensureDom()) return;
  const mode = _mode();
  const listWrap = document.querySelector('#section-tarefas .tarefas-list-wrap');
  const empty = document.getElementById('tarefas-empty');
  const filterBar = document.getElementById('tarefas-filter-bar');
  const kanban = document.getElementById('tk-kanban');
  const btnL = document.getElementById('tk-btn-list');
  const btnK = document.getElementById('tk-btn-kanban');
  const catWrap = document.getElementById('tk-cat');
  const catClear = document.getElementById('tk-cat-clear');

  const isK = mode === 'kanban';
  if (listWrap) listWrap.style.display = isK ? 'none' : '';
  if (empty && isK) empty.style.display = 'none';
  if (filterBar) filterBar.style.display = isK ? 'none' : '';   // filtros de prioridade são da lista
  if (kanban) kanban.style.display = isK ? 'grid' : 'none';
  if (catWrap) catWrap.style.display = isK ? '' : 'none';
  if (catClear) catClear.style.display = isK ? '' : 'none';
  if (btnL) btnL.classList.toggle('active', !isK);
  if (btnK) btnK.classList.toggle('active', isK);
  if (isK) renderKanban();
}

window.__tkSetView = function (m) { _setMode(m); _applyView(); };
window.__tkSetCat = function (c) { _catFilter = c || 'all'; const s = document.getElementById('tk-cat'); if (s) s.value = _catFilter; renderKanban(); };
window.__tkOpen = function (id) {
  if (typeof window.openTaskDetail === 'function') { try { window.openTaskDetail(id); return; } catch (e) {} }
  if (typeof window.openTaskInTarefas === 'function') { try { window.openTaskInTarefas(id); } catch (e) {} }
};

/* ── Integração: hook em tarefasRender + abertura da seção ───────────────── */
function _hookRender() {
  const fn = window.tarefasRender;
  if (typeof fn !== 'function' || fn.__tkHook__) return !!(fn && fn.__tkHook__);
  const wrapped = function () {
    const r = fn.apply(this, arguments);
    setTimeout(_applyView, 0);   // mantém o kanban sincronizado quando a lista re-renderiza
    return r;
  };
  wrapped.__tkHook__ = true;
  window.tarefasRender = wrapped;
  return true;
}

function _init() {
  let tries = 0;
  const t = setInterval(() => {
    _ensureDom();
    if (_hookRender() || ++tries > 40) clearInterval(t);
  }, 500);

  // aplica a visualização quando a seção Tarefas fica visível
  const sec = document.getElementById('section-tarefas');
  if (sec && window.MutationObserver) {
    let was = sec.classList.contains('open');
    new MutationObserver(() => {
      const open = sec.classList.contains('open');
      if (open && !was) setTimeout(_applyView, 30);
      was = open;
    }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  }
  setTimeout(_applyView, 1800);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();
