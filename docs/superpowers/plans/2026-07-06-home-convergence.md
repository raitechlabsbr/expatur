# Home Convergence (Accueil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o corpo da Home (`#section-welcome`) pelo layout `welcome-grid4` do `monolito.html` — Mémo/To-Do · Board DEPARTURES · Tâches · Tâches en retard — visualmente idêntico, com código limpo.

**Architecture:** Novo módulo autocontido `src/js/welcome-home.js` (padrão de fase, como `dashboard.js`) renderiza as 4 células lendo dos dados da plataforma (memos → localStorage; tarefas → `window.getAllTasks`; voos → `window._volsRows`). O render de welcome do `dashboard.js` é neutralizado. CSS portado para `src/styles/welcome.css`; markup do grid4 no `index.html`.

**Tech Stack:** Vanilla JS (ES modules via Vite), CSS, localStorage. Sem framework de teste no front — **verificação é runtime no dev server** (`npm run dev` → `localhost:3000`), coerente com o QA runtime do projeto.

## Global Constraints

- Não modificar `src/js/app.js` (débito do monólito; regra do projeto).
- Backend é Supabase; memos ficam em **localStorage** (`expatur_memos`) por decisão da spec.
- Só `#section-welcome` (Accueil) muda — sem regressão no resto do app.
- Idioma: base FR no HTML; PT via `src/js/i18n.js` (dicionário FR→PT). Textos novos precisam de entrada no dicionário.
- Board columns (ordem, igual monólito): DATE · FLIGHT · DEP · FROM · ARR · TO · PNR · CLIENT.

---

### Task 1: Scaffold — grid4 (CSS + HTML), módulo vazio registrado, dashboard neutralizado

**Files:**
- Modify: `src/styles/welcome.css` (adicionar CSS grid4/wg/v360-board no fim)
- Modify: `index.html:207-252` (substituir corpo de `#section-welcome`)
- Create: `src/js/welcome-home.js`
- Modify: `src/js/main.js:26` (registrar o novo módulo; remover import do dashboard.js se totalmente substituído — ver passo 5)
- Modify: `src/js/dashboard.js` (neutralizar render de welcome)

**Interfaces:**
- Produces: `window.welcomeHomeRefresh()` — re-renderiza as 4 células. IDs no DOM: `#memo-input`, `#memo-list`, `#welcome-flights-week`, `#welcome-tasks-today`, `#welcome-overdue`.

- [ ] **Step 1: Portar CSS do grid4 + board para `src/styles/welcome.css`**

Anexar ao fim de `src/styles/welcome.css` (copiado do monólito 529-575):

```css
/* ── Accueil grid4 (convergência monólito) ─────────────────────────────── */
#section-welcome .section-page-body{max-width:none;}
.welcome-grid4{display:grid;grid-template-columns:1fr 1fr;grid-template-areas:"memo board" "tasks overdue";gap:1.6rem;align-items:start;}
.welcome-grid4 > div{min-width:0;}
.wg-memo{grid-area:memo;} .wg-board{grid-area:board;min-height:230px;}
.wg-tasks{grid-area:tasks;} .wg-overdue{grid-area:overdue;}
#welcome-overdue{width:50%;transition:width 0.25s ease;}
#memo-list{display:grid;grid-template-columns:1fr 1fr;column-gap:1.1rem;align-content:start;}
@media(max-width:700px){#memo-list{grid-template-columns:1fr;}}
@media(max-width:1000px){.welcome-grid4{grid-template-columns:1fr;grid-template-areas:"memo" "board" "tasks" "overdue";}}
/* Split-flap departures board (preto/âmbar) */
.v360-board{background:#0a0a0a;border:1px solid #222;border-radius:10px;overflow:hidden;font-family:'JetBrains Mono','SF Mono','Courier New',monospace;box-shadow:0 4px 18px rgba(0,0,0,0.35);display:flex;flex-direction:column;height:230px;width:100%;}
.v360-board-head{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.85rem;background:repeating-linear-gradient(135deg,#141414 0 7px,#0b0b0b 7px 14px);border-bottom:2px solid #f5c518;}
.v360-board-title{color:#fff;font-weight:800;font-size:1.05rem;letter-spacing:0.14em;text-transform:uppercase;}
.v360-board-sub{color:#9a9a9a;font-size:0.78rem;letter-spacing:0.22em;}
.v360-board-cols,.v360-row{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,0.85fr) minmax(0,0.6fr) minmax(0,0.85fr) minmax(0,0.6fr) minmax(0,1fr) minmax(0,1.3fr);gap:0.4rem;}
.v360-board-cols{flex:0 0 auto;padding:0.45rem 0.85rem;font-size:0.63rem;letter-spacing:0.08em;color:#eaeaea;font-weight:700;text-transform:uppercase;border-bottom:1px solid #1c1c1c;background:#0c0c0c;}
.v360-board-rows{flex:1 1 auto;min-height:0;overflow:auto;}
.v360-row{align-items:center;padding:0.55rem 0.85rem;border-bottom:1px solid #161616;cursor:pointer;}
.v360-row:hover{background:#151515;}
.v360-row > span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.v360-c-date{color:#d6d6d6;font-size:0.84rem;font-weight:600;}
.v360-c-flight{color:#f5c518;font-size:0.9rem;font-weight:700;}
.v360-c-dept,.v360-c-arrt{color:#eaeaea;font-size:0.84rem;font-weight:600;}
.v360-c-dep,.v360-c-arr{color:#f5c518;font-size:0.87rem;font-weight:700;}
.v360-c-client{color:#d9b85a;font-size:0.84rem;font-weight:600;}
.v360-empty{padding:2rem 0.85rem;text-align:center;color:#9a9a9a;font-size:0.96rem;}
@media(max-width:1512px){#welcome-overdue{width:100%;}}
```

- [ ] **Step 2: Substituir o corpo de `#section-welcome` (index.html:207-252)**

Trocar o bloco de `<div class="section-page-body">` … até o fechamento (linha 252) por (base FR, igual monólito 1848-1874):

```html
  <div class="section-page-body">
    <div class="welcome-grid4">
      <div class="wg-memo">
        <div class="section-page-title" id="welcome-user-title" style="margin-bottom:1.1rem;">Bienvenu(e)</div>
        <div class="welcome-section-title">Mémo / To-Do</div>
        <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
          <div style="display:flex;gap:0.5rem;margin-bottom:0.7rem;">
            <input type="text" id="memo-input" placeholder="Ajouter une note ou un rappel…" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();addMemo();}">
            <button class="btn btn-gold btn-sm" onclick="addMemo()">Ajouter</button>
          </div>
          <div id="memo-list"></div>
        </div>
      </div>
      <div class="wg-board">
        <div id="welcome-flights-week"></div>
      </div>
      <div class="wg-tasks">
        <div class="welcome-section-title">Tâches</div>
        <div id="welcome-tasks-today" style="display:grid;grid-template-columns:1fr;gap:0.6rem;"></div>
      </div>
      <div class="wg-overdue">
        <div class="welcome-section-title">Tâches en retard</div>
        <div id="welcome-overdue" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Criar `src/js/welcome-home.js` (esqueleto com refresh + hooks)**

```js
// welcome-home.js — Accueil (grid4) fiel ao monólito. Módulo de fase, sem tocar app.js.
function _esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

function _renderMemo(){}   // Task 2
function _renderBoard(){}  // Task 3
function _renderTasks(){}  // Task 4
function _renderOverdue(){}// Task 4

function welcomeHomeRefresh(){
  const sec = document.getElementById('section-welcome');
  if (!sec || sec.offsetParent === null) return;
  try { _renderMemo(); } catch(e){ console.warn('[welcome] memo', e); }
  try { _renderBoard(); } catch(e){ console.warn('[welcome] board', e); }
  try { _renderTasks(); } catch(e){ console.warn('[welcome] tasks', e); }
  try { _renderOverdue(); } catch(e){ console.warn('[welcome] overdue', e); }
}
window.welcomeHomeRefresh = welcomeHomeRefresh;

// Hook: re-render ao abrir a Accueil e quando o app pedir welcomeRefresh.
const _origWelcomeRefresh = window.welcomeRefresh;
window.welcomeRefresh = function(){ try { if (typeof _origWelcomeRefresh === 'function') _origWelcomeRefresh.apply(this, arguments); } catch(e){} welcomeHomeRefresh(); };
const _origSidebarGo = window.sidebarGo;
if (typeof _origSidebarGo === 'function') {
  window.sidebarGo = function(s){ const r = _origSidebarGo.apply(this, arguments); if (s === 'welcome') setTimeout(welcomeHomeRefresh, 0); return r; };
}
document.addEventListener('DOMContentLoaded', function(){ setTimeout(welcomeHomeRefresh, 300); });
```

- [ ] **Step 4: Registrar o módulo e neutralizar o dashboard antigo**

Em `src/js/main.js`, substituir a linha `import './dashboard.js';` (linha 26) por `import './welcome-home.js';` (o `welcome-home.js` assume o render da Accueil; o kanban/vols do `dashboard.js` sai de cena).

- [ ] **Step 5: Verificar no dev server**

Run: `npm run dev` e abrir `localhost:3000` na Accueil.
Expected: grid 2×2 com 4 células rotuladas (Mémo/To-Do, board vazio, Tâches, Tâches en retard); **sem** botões de ação rápida nem kanban. Sem erro no console.

- [ ] **Step 6: Commit**

```bash
git add src/styles/welcome.css index.html src/js/welcome-home.js src/js/main.js
git commit -m "feat(home): scaffold grid4 da Accueil (convergência monólito) + neutraliza dashboard antigo"
```

---

### Task 2: Mémo / To-Do (localStorage)

**Files:**
- Modify: `src/js/welcome-home.js` (implementar `_renderMemo` + funções de memo)

**Interfaces:**
- Consumes: `#memo-input`, `#memo-list` (Task 1).
- Produces: `window.addMemo()`, `window.toggleMemo(i)`, `window.deleteMemo(i)`; chave localStorage `expatur_memos` (array de `{text,done,ts}`).

- [ ] **Step 1: Implementar memo (port verbatim do monólito 13401-13416 + toggle/delete)**

Substituir o `_renderMemo(){}` e adicionar as funções em `src/js/welcome-home.js`:

```js
function _loadMemos(){ try { return JSON.parse(localStorage.getItem('expatur_memos')||'[]'); } catch(e){ return []; } }
function _saveMemos(m){ try { localStorage.setItem('expatur_memos', JSON.stringify(m)); } catch(e){} }
function _renderMemo(){
  const list = document.getElementById('memo-list'); if (!list) return;
  const memos = _loadMemos();
  if (!memos.length){ list.innerHTML = '<div style="grid-column:1/-1;font-size:0.75rem;color:var(--navy-faint);padding:0.4rem 0;">Aucune note pour le moment.</div>'; return; }
  list.innerHTML = memos.map(function(m,i){
    return '<div style="display:flex;align-items:center;gap:0.55rem;padding:0.4rem 0.2rem;border-bottom:1px solid var(--light);">'
      +'<input type="checkbox" '+(m.done?'checked':'')+' onchange="toggleMemo('+i+')" style="width:15px;height:15px;flex-shrink:0;cursor:pointer;">'
      +'<span style="flex:1;font-size:0.8rem;color:var(--navy);'+(m.done?'text-decoration:line-through;opacity:0.5;':'')+'">'+_esc(m.text)+'</span>'
      +'<button onclick="deleteMemo('+i+')" title="Supprimer" style="background:none;border:none;cursor:pointer;font-size:1.05rem;line-height:1;color:var(--navy-faint);padding:0 4px;flex-shrink:0;opacity:0.6;">&times;</button>'
      +'</div>';
  }).join('');
}
window.addMemo = function(){ const inp = document.getElementById('memo-input'); if (!inp) return; const t = (inp.value||'').trim(); if (!t) return; const m = _loadMemos(); m.unshift({text:t,done:false,ts:Date.now()}); _saveMemos(m); inp.value=''; _renderMemo(); };
window.toggleMemo = function(i){ const m = _loadMemos(); if (m[i]){ m[i].done = !m[i].done; _saveMemos(m); _renderMemo(); } };
window.deleteMemo = function(i){ const m = _loadMemos(); m.splice(i,1); _saveMemos(m); _renderMemo(); };
```

- [ ] **Step 2: Verificar no dev**

Recarregar `localhost:3000` Accueil. Digitar uma nota + Enter → aparece na lista. Marcar checkbox → risca. Recarregar a página → persiste. Apagar (×) → some.

- [ ] **Step 3: Commit**

```bash
git add src/js/welcome-home.js
git commit -m "feat(home): Mémo/To-Do em localStorage (port do monólito)"
```

---

### Task 3: Board DEPARTURES (`.v360-board`, voos da semana)

**Files:**
- Modify: `src/js/welcome-home.js` (implementar `_renderBoard`)

**Interfaces:**
- Consumes: `#welcome-flights-week` (Task 1); `window._volsRows` (array de voos da feature Vols, campos `flight_date`, `flight_number`/`airline`, `dep_time`, `dep`/`origin`, `arr_time`, `arr`/`dest`, `pnr`, `client`); `window._volsLoaded`; `window.volsLoad()` (dispara carga).
- Produces: board `.v360-board` renderizado dentro de `#welcome-flights-week`.

- [ ] **Step 1: Implementar `_renderBoard` (janela de 7 dias, colunas do monólito)**

```js
function _volsRows(){ return (window._volsLoaded && Array.isArray(window._volsRows)) ? window._volsRows : null; }
function _parseVolDate(s){ try { return window._volsParseDate ? window._volsParseDate(s) : new Date(s); } catch(e){ return new Date(s); } }
function _renderBoard(){
  const host = document.getElementById('welcome-flights-week'); if (!host) return;
  // dispara a carga da feature Vols uma vez (ela chama welcomeRefresh ao concluir)
  if (!window._volsLoaded && !window.__welcomeVolsAutoLoad && typeof window.volsLoad === 'function'){ window.__welcomeVolsAutoLoad = true; try { window.volsLoad(); } catch(e){} }
  const rows = _volsRows();
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const d7 = new Date(d0); d7.setDate(d0.getDate()+7);
  const upcoming = (rows||[]).filter(function(r){ const d=_parseVolDate(r.flight_date); return d>=d0 && d<=d7; })
    .sort(function(a,b){ return _parseVolDate(a.flight_date)-_parseVolDate(b.flight_date); });
  const head = '<div class="v360-board-head"><span class="v360-board-title">✈ Departures</span><span class="v360-board-sub">Next 7d</span></div>'
    + '<div class="v360-board-cols"><span>Date</span><span>Flight</span><span>Dep</span><span>From</span><span>Arr</span><span>To</span><span>PNR</span><span>Client</span></div>';
  let body;
  if (!rows){ body = '<div class="v360-empty">Chargement…</div>'; }
  else if (!upcoming.length){ body = '<div class="v360-empty">Aucun vol cette semaine</div>'; }
  else {
    body = '<div class="v360-board-rows">' + upcoming.map(function(r){
      const ref = _esc(r.booking_ref||r.ref||'');
      return '<div class="v360-row"'+(ref?' data-dossier-ref="'+ref+'" onclick="window.sidebarGo && window.sidebarGo(\'bookings\')"':'')+'>'
        + '<span class="v360-c-date">'+_esc(r.flight_date||'')+'</span>'
        + '<span class="v360-c-flight">'+_esc(r.flight_number||r.airline||'')+'</span>'
        + '<span class="v360-c-dept">'+_esc(r.dep_time||'')+'</span>'
        + '<span class="v360-c-dep">'+_esc(r.dep||r.origin||'')+'</span>'
        + '<span class="v360-c-arrt">'+_esc(r.arr_time||'')+'</span>'
        + '<span class="v360-c-arr">'+_esc(r.arr||r.dest||'')+'</span>'
        + '<span class="v360-c-flight">'+_esc(r.pnr||'')+'</span>'
        + '<span class="v360-c-client">'+_esc(r.client||'')+'</span>'
        + '</div>';
    }).join('') + '</div>';
  }
  host.innerHTML = '<div class="v360-board">'+head+body+'</div>';
}
```

> Nota de implementação: confirmar os nomes reais dos campos em `window._volsRows` lendo `src/js/vols.js` (o objeto de linha). Ajustar os acessos (`r.flight_date`, `r.dep`, etc.) ao schema real antes do commit — o fallback `||` já cobre variações comuns.

- [ ] **Step 2: Verificar no dev**

Recarregar Accueil. O board escuro "✈ DEPARTURES" aparece na célula superior direita com os voos da semana (ou "Aucun vol cette semaine"). Clicar numa linha abre Bookings.

- [ ] **Step 3: Commit**

```bash
git add src/js/welcome-home.js
git commit -m "feat(home): board DEPARTURES (v360) na Accueil"
```

---

### Task 4: Tâches + Tâches en retard + verificação final

**Files:**
- Modify: `src/js/welcome-home.js` (implementar `_renderTasks`, `_renderOverdue`)

**Interfaces:**
- Consumes: `#welcome-tasks-today`, `#welcome-overdue` (Task 1); `window.getAllTasks()` (array de tarefas com `id`, `title`/`text`, `due`/`dueDate`, `status`/`done`); `window.__dashOpenTask(id)` ou `window.openTaskDetail(id)`.
- Produces: listas renderizadas nas duas células.

- [ ] **Step 1: Implementar `_renderTasks` e `_renderOverdue`**

```js
function _allTasks(){ try { return (typeof window.getAllTasks==='function') ? (window.getAllTasks()||[]) : []; } catch(e){ return []; } }
function _taskDue(t){ const v = t.due||t.dueDate||t.date; if (!v) return null; const d = new Date(v); return isNaN(d)?null:d; }
function _taskDone(t){ return t.status==='done' || t.done===true; }
function _openTask(id){ if (typeof window.openTaskDetail==='function'){ try{ window.openTaskDetail(id); return; }catch(e){} } if (typeof window.__dashOpenTask==='function') window.__dashOpenTask(id); }
window.__welcomeOpenTask = _openTask;
function _taskRow(t){
  return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.7rem;background:#fff;border:1px solid var(--border);border-radius:8px;cursor:pointer;" onclick="window.__welcomeOpenTask(\''+_esc(String(t.id))+'\')">'
    + '<span style="flex:1;font-size:0.8rem;color:var(--navy);">'+_esc(t.title||t.text||'—')+'</span>'
    + '<span style="font-size:0.68rem;color:var(--navy-faint);">'+(_taskDue(t)?_esc(_taskDue(t).toLocaleDateString('fr-FR')):'')+'</span>'
    + '</div>';
}
function _renderTasks(){
  const host = document.getElementById('welcome-tasks-today'); if (!host) return;
  const d0 = new Date(); d0.setHours(0,0,0,0); const d7 = new Date(d0); d7.setDate(d0.getDate()+7);
  const items = _allTasks().filter(function(t){ if (_taskDone(t)) return false; const d=_taskDue(t); return d && d>=d0 && d<=d7; })
    .sort(function(a,b){ return (_taskDue(a)||0)-(_taskDue(b)||0); });
  host.innerHTML = items.length ? items.map(_taskRow).join('')
    : '<div style="font-size:0.75rem;color:var(--navy-faint);font-style:italic;">Aucune tâche à afficher</div>';
}
function _renderOverdue(){
  const host = document.getElementById('welcome-overdue'); if (!host) return;
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const items = _allTasks().filter(function(t){ if (_taskDone(t)) return false; const d=_taskDue(t); return d && d<d0; })
    .sort(function(a,b){ return (_taskDue(a)||0)-(_taskDue(b)||0); });
  host.innerHTML = items.length ? items.map(_taskRow).join('')
    : '<div style="font-size:0.75rem;color:var(--navy-faint);font-style:italic;">Aucune tâche en retard 🎉</div>';
}
```

> Nota: confirmar em `src/js/app.js`/`dashboard.js` a forma real de `getAllTasks()` (campos de título e vencimento) e ajustar `_taskDue`/`title` se necessário.

- [ ] **Step 2: Adicionar entradas i18n (PT) dos textos novos**

Em `src/js/i18n.js`, no dicionário `T`, adicionar:

```js
  'Mémo / To-Do':               'Memorando / A fazer',
  'Ajouter':                    'Adicionar',
  'Tâches en retard':           'Tarefas atrasadas',
  'Aucune note pour le moment.':'Sem notas por enquanto.',
  'Aucune tâche à afficher':    'Nenhuma tarefa a exibir',
  'Aucune tâche en retard 🎉':  'Nenhuma tarefa atrasada 🎉',
  'Aucun vol cette semaine':    'Nenhum voo esta semana',
```

- [ ] **Step 3: Verificação final no dev**

Recarregar `localhost:3000` Accueil e conferir contra o monólito (Image #5):
- Grid 2×2: Mémo (canto sup. esq.), Board DEPARTURES (sup. dir.), Tâches (inf. esq.), Tâches en retard (inf. dir.).
- Tâches e Overdue refletem o store real; clicar abre o detalhe da tarefa.
- Toggle FR⇄PT: rótulos e vazios traduzem corretamente.
- Reduzir a janela (<1000px): colapsa para 1 coluna.
- Sem erros no console; resto do app intacto.

- [ ] **Step 4: Commit**

```bash
git add src/js/welcome-home.js src/js/i18n.js
git commit -m "feat(home): Tâches + Tâches en retard na Accueil + i18n; conclui convergência da Home"
```

---

## Notas de execução
- Confirmar schemas reais (`window._volsRows`, `window.getAllTasks()`) lendo `src/js/vols.js` e `src/js/dashboard.js`/`app.js` antes de fechar as Tasks 3 e 4 — o plano usa fallbacks, mas os nomes de campo devem casar com o real.
- Se algo de `dashboard.js` (ex.: lógica de logos de cia) for necessário ao board, migrar a função para `welcome-home.js` em vez de reimportar `dashboard.js`.
