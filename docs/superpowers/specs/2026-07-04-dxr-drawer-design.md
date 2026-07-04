# Design — Feature DXR Drawer (Dossier Command-Center)

> Porte da feature **DXR — Dossier Command-Center Drawer** do `docs/monolito.html` (produção) para
> a plataforma. Um painel lateral (drawer) que abre ao clicar num dossiê e concentra travel,
> ledger financeiro, tarefas, histórico, memo, NF e passaporte. Parte da convergência
> (ver [../../AUDITORIA_CONVERGENCIA.md](../../AUDITORIA_CONVERGENCIA.md) §5). Data: 2026-07-04.
>
> **Decomposição:** DXR foi dividida em 2 subsistemas (decisão do usuário). Esta spec cobre o
> **DRAWER** (subsistema A). O **ledger de fornecedores ("Abertos")** (subsistema B) é uma feature
> própria, a seguir.

## 1. Contexto e objetivo

O monólito tem o **DXR drawer**: um painel lateral deslizante (`#dxr-panel`, overlay) aberto por
`openDossierDrawer(ref)`. É o "command center" do dossiê — reúne, num só lugar, os dados de viagem,
o **ledger financeiro editável** (custos/margem por dossiê), as **tarefas**, o **histórico**, um
**memo** rich-text, o número de **NF (nota fiscal)** e o **passaporte** do pax, além de atalhos
(Email de confirmação, Invoice, Cliente, Fornecedor).

A plataforma não tem a feature (gap §5, ~28 funções só-monólito). O drawer já está **enganchado**:
o `recap.js` (feature Recap, já portada) chama `openDossierDrawer(ref)` no clique da linha (com
guard) — quando o drawer existir, o clique abre-o.

Objetivo: **port fiel completo** do drawer, preservando UX/UI. O drawer é **100% localStorage**
(confirmado: zero Cloudflare/fetch no range 76483–77714) — sem backend novo, sem migration.

## 2. Decisões (validadas com o usuário)

1. **Decomposição:** DRAWER primeiro; ledger de fornecedores depois (ciclo próprio).
2. **Escopo:** **port fiel do drawer inteiro** — todos os painéis (travel, finance ledger, tarefas,
   histórico, memo, NF, passaporte) e os links (Email→COMMS, Invoice, Cliente, Fornecedor).
3. **Backend:** **localStorage** (sem Cloudflare) — reusa os stores que a plataforma já tem.

## 3. Estrutura e fluxo

- **Abertura:** `window.openDossierDrawer(ref)` injeta (via JS) um overlay `#dxr-overlay` com o
  painel deslizante `#dxr-panel` (CSS `dxr-*` injetada via `<style>` — parte do IIFE portado). Fecha
  por botão/Esc/click-fora. Já é chamado pelo Recap; opcionalmente também dos rows de Bookings.
- **Corpo do drawer** (`#dxr-body`): renderizado por `_dxrRefresh` como
  `_travel(g) + _fin(g) + _taskSec(g) + _history(g)`, onde `g = _gather(ref)` coleta os dados do
  dossiê/billet. Memo, NF e passaporte aparecem dentro/adjacentes a essas seções.
- **Header:** botões **💾 Save** (`_dxrSaveAll`), ✎ Éditer, ✉ Email confirmation (`_dxrEmail` →
  `openCommsPopup`, COMMS já portado), 🧾 Invoice (`_dxrInvoice`, copia link + abre).

## 4. Painéis (port fiel)

- **Travel** (`_travel`): pax, rota, datas, cia, PNR — derivado do dossiê/billet.
- **Finance ledger** (`_fin` + `_dxrFinAdd`/`_dxrFinRecalc`/`_dxrFinDelete`/`_dxrFinEditConfirm`/
  `_dxrFinPersist`): tabela de linhas editáveis (custo fornecedor, miles, taxas, extras), recálculo
  ao vivo de **RAV brut / RAV nette estimée**, persistindo em
  `localStorage['expatur_financeiro_lancamentos']` (o mesmo store do Financeiro da plataforma).
  Edição confirma antes de sincronizar Supplier/Financial/Dossier. Debounce no persist.
- **Tarefas** (`_taskSec` + `_dxrOpenTask`/`_dxrSaveTask`): lista as tarefas do dossiê e permite
  criar; reusa o sistema de tarefas da plataforma (`tasks_v2_<ref>`).
- **Histórico** (`_history`): timeline de status/eventos do dossiê (reusa `DEAL_STATUS`/timeline da
  plataforma quando disponível).
- **Memo** (`#dxr-memo` contenteditable + `_dxrMemoCmd`/`_dxrMemoDirty`/`_dxrMemoSave`): nota
  rich-text por dossiê (bold/italic/lista), autosave debounced em localStorage.
- **NF** (`#dxr-nf-input` + `_dxrSaveNF`): grava o nº da nota fiscal criando/atualizando uma tarefa
  na categoria **"Notas Fiscais"** (marca done quando preenchido) — reusa tarefas.
- **Passaporte** (`_dxrPassport(idx)`): abre o scan de passaporte do pax (reusa `documents.js`, que
  já guarda o doc `passport` por pax).

## 5. Links e integrações

- **Email confirmation** → `openCommsPopup` (COMMS, já portado).
- **Invoice** (`_dxrInvoiceUrl`/`_dxrInvoice`): monta/copia o link da fatura e abre.
- **Cliente** (`_dxrClient` → `clientsViewProfile`, já existe na plataforma).
- **Fornecedor** (`_dxrOpenSupplier` + `_dxrSyncSuppliers`): abre a ficha do fornecedor.

## 6. Arquivos e integração

- `src/js/dxr.js` — módulo: o IIFE do DXR portado **verbatim** de `docs/monolito.html`
  **76483–77714** (inclui `openDossierDrawer`, `_gather`, `_travel/_fin/_taskSec/_history`, os
  `_dxrFin*`, memo, NF, passaporte, links, e a CSS `dxr-*` injetada). Exporta
  `window.openDossierDrawer` + os handlers `window._dxr*`.
- `src/js/main.js` — importar `dxr.js` (depois de `app.js`, `comms.js`, `documents.js`; o drawer
  usa dossiê/billet/financeiro/tarefas/`clientsViewProfile`/`openCommsPopup`).
- `index.html` — **sem alteração** (o drawer é injetado via JS).

Sem migration, sem Edge Function, sem backend novo.

## 7. Pontos a verificar na implementação (IMPORTANTE)

- **Helpers do app.js não exportados (a classe de bug recorrente):** o DXR (~1230 linhas) chama
  MUITOS helpers definidos no IIFE do `app.js` (ex.: formatadores `_brl`/`_esc`, cálculo de
  RAV/P&L, `_billet`/`_gather` de dados, deal-value, timeline). Como `dxr.js` é módulo separado,
  qualquer helper NÃO exposto em `window` resolve para `undefined` e o painel degrada silenciosamente
  (aconteceu no COMMS e no Recap). **A implementação deve varrer todos os identificadores que o
  dxr.js referencia e que vivem no app.js, e exportar os que faltarem** (padrão `if (typeof X ===
  'function') window.X = X;` no bloco de early-exports do app.js) — ou confirmar que já são globais.
- **CSS `dxr-*`:** o bloco de estilo é injetado via JS (array de strings ~77303+) dentro do IIFE —
  portar junto; conferir que não colide com estilos existentes.
- **Chave de persistência do memo:** confirmar a chave que `_dxrMemoSave` usa e que é local.
- **Ordem de import** em `main.js` (dxr depois dos módulos de que depende).
- **Encapsular** helpers internos do dxr.js (não vazar globais que colidam com o app.js).

## 8. Fora de escopo

- **Ledger de fornecedores / "Abertos"** (subsistema B do DXR) — feature própria, a seguir.
- Qualquer sync em nuvem (o drawer é local; não há Cloudflare no range).
- Reescrever o Financeiro/Tarefas/Documents da plataforma — o drawer **reusa** esses stores.

## 9. Critérios de teste

1. `npm run build` verde.
2. No Recap (ou Bookings), clicar numa linha → o drawer desliza da direita com os dados do dossiê.
3. **Finance ledger:** add/editar/excluir linha recalcula RAV brut/net ao vivo e persiste
   (recarregar o drawer mantém; o Financeiro reflete o mesmo `expatur_financeiro_lancamentos`).
4. **Tarefas:** lista as tarefas do dossiê; criar uma aparece também em Tarefas.
5. **Memo:** digitar salva (autosave) e persiste ao reabrir.
6. **NF:** salvar um nº cria/atualiza a tarefa "Notas Fiscais" (marca done).
7. **Passaporte:** clicar no pax abre o scan de passaporte (se houver doc).
8. **Links:** Email abre o COMMS; Cliente abre a ficha; Invoice copia/abre o link.
9. Fechar por botão/Esc/click-fora. Sem erro/chamada de rede no console.
