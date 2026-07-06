# Design — Convergência da Home (Accueil) com o `monolito.html`

> Objetivo: deixar a **Home/Accueil** (`#section-welcome`) da plataforma **idêntica ao monólito** (fonte de verdade),
> substituindo o layout atual (botões de ação rápida + kanban de 3 colunas) pelo `welcome-grid4` do monólito.
> Data: 2026-07-06 · Branch: `main` (parte da convergência UI, após sidebar-order + sidebar-i18n).

## 1. Motivação

A Home da plataforma divergiu da produção:

| Monólito (produção) | Plataforma (atual) |
|---|---|
| `welcome-grid4`: **Mémo/To-Do** · **Board DEPARTURES** · **Tâches** · **Tâches en retard** | Botões de ação rápida · **Tâches kanban (3 col)** · Vols de la semaine (escondido) |

O usuário aprovou **substituição total** pela Home do monólito.

## 2. Layout-alvo (`welcome-grid4`)

Grid 2×2 (`grid-template-areas: "memo board" / "tasks overdue"`), colapsa para 1 coluna ≤1000px:

- **`wg-memo`** — título "Bienvenu(e)" + **Mémo / To-Do** (input + lista de notas pessoais).
- **`wg-board`** — **Board DEPARTURES** (`#welcome-flights-week`), estilo split-flap preto/âmbar (`.v360-board`).
- **`wg-tasks`** — **Tâches** (`#welcome-tasks-today`), lista simples (não kanban).
- **`wg-overdue`** — **Tâches en retard** (`#welcome-overdue`), lista de tarefas vencidas.

## 3. Componentes, fonte e dados

| Componente | Fonte (monólito) | Dados na plataforma | Adaptação |
|---|---|---|---|
| **Mémo / To-Do** | `renderMemos`/`addMemo`/`toggleMemo`/`deleteMemo` + `_loadMemos`/`_saveMemos` (13401-13416) | **localStorage** `expatur_memos` (decisão aprovada; notas pessoais) | Port **verbatim** (código limpo, sem deps). |
| **Board DEPARTURES** | CSS `.v360-board*` (540-575) + render em `#welcome-flights-week` (patches v360, 41049-41208) | Voos derivados dos dossiês/billets (já lidos pelo `dashboard.js` `_renderFlights`) | Portar **CSS `.v360-board`**; render limpo no módulo novo reusando a lógica de voos atual. |
| **Tâches** | `#welcome-tasks-today` (welcomeRefresh 16820, patches) | Store de tarefas atual (Supabase-backed) | Render **lista simples** estilo monólito, lendo do store atual. |
| **Tâches en retard** | `#welcome-overdue` | Mesmo store, filtrado por `due < hoje` e não-concluídas | Novo render. |

## 4. Abordagem de implementação

**Não portar a cadeia emaranhada de patches** (`v346`/`v360`/`welcomeRefresh`) do monólito — a auditoria confirma que a versão
efetiva depende de ordem de carga e é frágil. Em vez disso:

1. **Novo módulo `src/js/welcome-home.js`** que renderiza as 4 células do `welcome-grid4` de forma limpa, lendo dos dados
   da plataforma (tarefas via store atual; voos via a lógica já existente; memos via localStorage). Faz hook em
   `window.welcomeRefresh` + `window.sidebarGo` + MutationObserver, **igual ao padrão do `dashboard.js`**.
2. **Neutralizar o render de welcome do `dashboard.js`** (kanban + "Vols de la semaine") — substituído pelo módulo novo.
   Manter `dashboard.js` só se houver lógica reaproveitável de voos; senão migrar para o módulo novo.
3. **`index.html`**: substituir o corpo de `#section-welcome` (remover `welcome-quick-actions`; trocar pela marcação
   `welcome-grid4` do monólito) e **portar o CSS** `welcome-grid4`/`wg-*`/`.v360-board*`.
4. **Mémo**: portar as 5 funções verbatim para o módulo novo, expor `addMemo`/`toggleMemo`/`deleteMemo` em `window`.

### Isolamento / interfaces
- `welcome-home.js` é autocontido: entrada = dados (localStorage memos + store de tarefas + voos); saída = DOM das 4 células.
- Não toca em `app.js`. Segue o modelo de módulo de fase (como `dashboard.js`, `recap.js`, `dxr.js`).

## 5. Fora de escopo (YAGNI)
- Migrar os memos para Supabase (fica localStorage por ora; há hook do monólito na 75745 se quisermos depois).
- Alterar títulos de seção / botões da home fora da Accueil (é a "parte" de i18n dos títulos, separada).
- Import CSV / features não relacionadas.

## 6. Verificação
- Dev `localhost:3000`: a Accueil mostra grid 2×2 idêntico ao monólito (Mémo, Board DEPARTURES escuro, Tâches, Overdue).
- Mémo: adicionar/concluir/apagar nota persiste em `localStorage`.
- Tâches/Overdue refletem o store real; Board mostra os voos da semana.
- Toggle FR⇄PT continua correto; responsivo colapsa para 1 coluna ≤1000px.
- Sem regressão no resto do app (só `#section-welcome` muda).
