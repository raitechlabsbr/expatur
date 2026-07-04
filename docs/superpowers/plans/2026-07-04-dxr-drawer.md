# Plano de Implementação — Feature DXR Drawer (Dossier Command-Center)

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`).

**Objetivo:** Portar o **DXR drawer** (painel lateral command-center do dossiê) do
`docs/monolito.html` para a plataforma, 100% localStorage, reusando os stores existentes.

**Arquitetura:** Port fiel de transcrição de um IIFE grande (monólito 76483–77714, ~1230 linhas)
para `src/js/dxr.js`, com a CSS `dxr-*` injetada via JS (parte do IIFE). Depois, um **sweep** dos
helpers que o `dxr.js` referencia mas que vivem no IIFE do `app.js` e não estão em `window` — a
classe de bug que degradou COMMS e Recap — exportando os que faltam.

**Tech Stack:** Vanilla JS (ES modules, bridges `window.*`), Vite (`npm run build`). Sem backend,
sem migration.

## Global Constraints

- **Sem test runner.** Verificação = `npm run build` verde + checagem runtime no browser. Não
  inventar vitest/jest.
- **Fonte de verdade do código portado:** `docs/monolito.html` 76483–77714. Portar **verbatim**;
  o drawer é 100% local (confirmado: zero `EXPATUR_API`/`fetch` no range) — **não há nada de
  Cloudflare a remover**.
- **Reusa os stores da plataforma:** `expatur_financeiro_lancamentos` (Financeiro), `tasks_v2_<ref>`
  (Tarefas), dossiê/billet, `documents.js` (passaporte), `clientsViewProfile` (Cliente),
  `openCommsPopup` (Email — COMMS já portado).
- **`index.html` NÃO muda** (o drawer é injetado via JS).
- **Encapsular** helpers internos do dxr.js no IIFE — não vazar globais que colidam com o app.js.
- **UI em francês** (rótulos idênticos ao monólito). Comentários de código em português.
- **Não regenerar `app.js`** com extract.py — as exportações do sweep são edições à mão no bloco de
  early-exports (mesmo padrão de `_blGetAllLegs`/`_diDealValue`/`_diPaxName`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/js/dxr.js` | Módulo: IIFE do drawer (open/gather/render, finance ledger, tarefas, histórico, memo, NF, passaporte, links) + CSS injetada | Criar |
| `src/js/main.js` | Importar `dxr.js` | Modificar |
| `src/js/app.js` | Exportar a `window` os helpers que o dxr.js precisa e que faltam (Task 2) | Modificar |

---

## Task 1: `dxr.js` — port do drawer (estrutura + CSS)

Porta o IIFE do DXR verbatim. Deliverable: clicar numa linha do Recap (ou chamar
`window.openDossierDrawer(ref)` no console) desliza o drawer com suas seções renderizadas. Alguns
valores podem sair degradados até o sweep da Task 2 — aqui o foco é o drawer abrir e a estrutura
renderizar sem erro fatal.

**Files:**
- Create: `src/js/dxr.js`
- Modify: `src/js/main.js` (import)

**Interfaces:**
- Consumes: dossiê/billet em localStorage; `window._diDealValue`/`_diPaxName` (já exportados);
  `window.clientsViewProfile`, `window.openCommsPopup` (já existem). Outros helpers do app.js →
  resolvidos no sweep da Task 2.
- Produces: `window.openDossierDrawer(ref)` + os handlers `window._dxr*` (`_dxrFinAdd`,
  `_dxrFinRecalc`, `_dxrFinDelete`, `_dxrFinEditConfirm`, `_dxrFinPersist`, `_dxrSaveAll`,
  `_dxrRefresh`, `_dxrMemoSave`/`_dxrMemoDirty`/`_dxrMemoCmd`, `_dxrSaveNF`, `_dxrPassport`,
  `_dxrOpenTask`/`_dxrSaveTask`, `_dxrEmail`, `_dxrInvoice`, `_dxrClient`, `_dxrOpenSupplier`,
  `_dxrSyncSuppliers`).

- [ ] **Step 1: Criar `src/js/dxr.js` portando o IIFE verbatim**

Criar `src/js/dxr.js` com um `import` no topo (para deps que precisem — provavelmente nenhuma além
das globais `window.*`, então pode ser sem import) e o IIFE do DXR transcrito **verbatim** de
`docs/monolito.html` **76483–77714** (de `if (window._dxrInit) return; window._dxrInit = true;` até
o `})();` na linha 77714). Isso inclui: a CSS `dxr-*` injetada (array de strings ~77303+),
`openDossierDrawer`, `_gather`, `_travel`/`_fin`/`_taskSec`/`_history`, todos os `_dxrFin*`, memo
(`_dxrMemo*`), NF (`_dxrSaveNF`), passaporte (`_dxrPassport`), e os links
(`_dxrEmail`/`_dxrInvoice`/`_dxrClient`/`_dxrOpenSupplier`/`_dxrSyncSuppliers`). **Não** alterar a
lógica — é port fiel; o drawer é 100% local.

- [ ] **Step 2: Importar `dxr.js` no `main.js`**

Em `src/js/main.js`, após `import './recap.js';`, adicionar:

```javascript
import './dxr.js';
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build verde. Sem erro de sintaxe / declaração duplicada. (Referências a helpers do app.js
ainda não exportados NÃO quebram o build — são resolvidas em runtime; o sweep é a Task 2.)

- [ ] **Step 4: Verificação estática (sem Cloudflare) + inventário para a Task 2**

Run: `grep -nE "EXPATUR_API|fetch\(|/api/" src/js/dxr.js`
Expected: **nenhuma** ocorrência (o drawer é local).

Além disso, gerar o **inventário de identificadores** que o dxr.js chama e que podem viver no
app.js (insumo da Task 2). Documentar no report a saída de:
`grep -oE "window\.[A-Za-z_][A-Za-z0-9_]*\(" src/js/dxr.js | sort -u` e uma lista dos identificadores
chamados **sem** `window.` que não são definidos dentro do próprio dxr.js.

- [ ] **Step 5: Verificação runtime (estrutura abre)**

`npm run dev` → abrir o app, ir ao Recap (Bookings) e clicar numa linha (ou `window.openDossierDrawer('<ref>')`
no console).
Expected: o painel `#dxr-panel` desliza da direita com o overlay; as seções (travel/finance/tarefas/
histórico/memo/NF) renderizam; fecha por botão/Esc/click-fora. Alguns valores podem estar "—" até a
Task 2. Sem erro **fatal** no console (um `X is not a function` de helper faltante é esperado e
alimenta a Task 2 — anotar quais).

- [ ] **Step 6: Commit**

```bash
git add src/js/dxr.js src/js/main.js
git commit -m "feat(dxr): drawer command-center do dossiê (port do IIFE + CSS, 100% local)"
```

---

## Task 2: Sweep de helpers do app.js (integração — sem degradação silenciosa)

Identifica todos os helpers que o `dxr.js` referencia e que estão definidos no IIFE do `app.js` mas
**não** expostos em `window`, e os exporta — evitando a degradação silenciosa que atingiu COMMS e
Recap. Deliverable: os painéis do drawer populam com dados reais (finance RAV, travel, deal value,
etc.), sem `undefined`/`— ` por helper faltante.

**Files:**
- Modify: `src/js/app.js` (bloco de early-exports)

**Interfaces:**
- Consumes: o inventário de identificadores da Task 1 Step 4.
- Produces: `window.X = X` (guardado) no app.js para cada helper faltante que o dxr.js usa.

- [ ] **Step 1: Levantar os identificadores que o dxr.js referencia**

Rodar e juntar as duas listas:
```bash
# chamadas via window.
grep -oE "window\.[A-Za-z_][A-Za-z0-9_]*" src/js/dxr.js | sed 's/window\.//' | sort -u > /tmp/dxr_win.txt
# chamadas de função "bare" (sem window.) — candidatas a global do app.js
grep -oE "[^.A-Za-z0-9_][A-Za-z_][A-Za-z0-9_]*\(" src/js/dxr.js | grep -oE "[A-Za-z_][A-Za-z0-9_]*" | sort -u > /tmp/dxr_bare.txt
```

- [ ] **Step 2: Cruzar com o que o app.js já expõe e com o que é definido no próprio dxr.js**

Para cada identificador das listas, classificar:
1. **Definido dentro do `dxr.js`** (função/var local do IIFE) → ignorar (resolve lexicalmente).
2. **Já exposto no app.js** (`grep -n "window.<id> *=" src/js/app.js` acha) → ok, nada a fazer.
3. **Definido no app.js mas NÃO exposto** (`grep -nE "function <id>\b|(^|[^.])<id> *=" src/js/app.js`
   acha a definição, mas não há `window.<id> =`) → **precisa exportar** (o dxr.js chama bare/via
   window e resolveria para `undefined` cross-module).
4. **Global do browser / definido em outro módulo já exposto** → ok.

Focar nos que o dxr.js realmente usa para renderizar dados: formatadores (`_brl`, `_esc`,
`_fmtBRL*`), cálculo de custo/RAV/P&L, coleta de dados do dossiê/billet, timeline/histórico,
fornecedor. Documentar a tabela (id → status → ação) no report.

- [ ] **Step 3: Exportar os helpers faltantes no app.js**

No `src/js/app.js`, no bloco de "early window exports" (onde estão
`window._blGetAllLegs`/`_diDealValue`/`_diPaxName`), adicionar uma linha guardada por helper
faltante, no mesmo padrão:

```javascript
  if (typeof <id> === 'function') window.<id> = <id>;
```

(Para constantes/objetos não-função que o dxr.js precise, usar `if (typeof <id> !== 'undefined')
window.<id> = <id>;`.) Adicionar apenas os que a Task 2 Step 2 classificou como "definido mas não
exposto E usado pelo dxr.js". Não exportar o que não é usado.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 5: Verificação estática**

Run: para cada helper exportado, `grep -n "window.<id> = <id>" src/js/app.js` (confirma a linha) e
reconferir que cada um é referenciado no `dxr.js`.
Documentar no report a lista final de exports adicionados.

- [ ] **Step 6: Verificação runtime (painéis populam)**

`npm run dev` → abrir o drawer num dossiê com dados (custos/tarefas).
Expected: **Finance ledger** mostra as linhas com valores e RAV brut/net calculados; **Travel** com
pax/rota/PNR; **Tarefas** lista as do dossiê; **Histórico** com eventos; **Memo/NF** funcionam.
Nenhum `X is not a function` no console; nenhum painel silenciosamente vazio por helper faltante.

- [ ] **Step 7: Commit**

```bash
git add src/js/app.js
git commit -m "fix(dxr): exporta helpers do app.js usados pelo drawer (sem degradação cross-module)"
```

---

## Self-Review

**1. Cobertura da spec:**
- §2.2 port fiel do drawer inteiro → Task 1 (IIFE verbatim). ✓
- §2.3 backend localStorage / §8 sem Cloudflare → Task 1 Step 4 (grep confirma). ✓
- §3 abertura/corpo/header → Task 1 (openDossierDrawer + _dxrRefresh + header). ✓
- §4 painéis (travel/finance/tarefas/histórico/memo/NF/passaporte) → Task 1 (port) + Task 2 (dados
  populam). ✓
- §5 links (Email→COMMS, Invoice, Cliente, Fornecedor) → Task 1 (port; deps já exportadas). ✓
- §6 arquivos (dxr.js, main.js; index.html sem mudança) → Tasks 1–2. ✓
- §7 pontos a verificar (sweep de helpers = **coração da Task 2**; CSS injetada; chave do memo;
  ordem de import; encapsular) → Tasks 1–2. ✓
- §9 critérios de teste → verificações runtime das Tasks 1–2. ✓

**2. Placeholders:** o "portar verbatim 76483–77714" aponta código real em local exato; a Task 2 é
um **procedimento concreto** (grep → classificar → exportar) com comandos e critérios, não um "TODO"
vago. A lista exata de helpers a exportar só é conhecível lendo o dxr.js portado — por isso a Task 2
a **produz** (não é placeholder; é o entregável da task).

**3. Consistência de tipos/nomes:** `window.openDossierDrawer`, os `window._dxr*`, e os stores
(`expatur_financeiro_lancamentos`, `tasks_v2_<ref>`) são consistentes entre Task 1 (produz) e Task 2
(garante que os helpers de dados por trás resolvem). O padrão de export do app.js
(`if (typeof X === 'function') window.X = X;`) casa com o já usado por `_blGetAllLegs`/`_diDealValue`/
`_diPaxName`.

## Handoff de execução

**Plano completo e salvo em `docs/superpowers/plans/2026-07-04-dxr-drawer.md`. Duas opções:**

**1. Subagent-Driven (recomendado)** — despacho um subagente por task, reviso entre elas.

**2. Execução Inline** — executo nesta sessão com executing-plans, em lote com checkpoints.

**Qual abordagem?**
