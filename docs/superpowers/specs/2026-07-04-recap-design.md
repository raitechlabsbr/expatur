# Design — Feature Recap (relatório de reservas)

> Porte da feature **Recap** do `docs/monolito.html` (produção) para a plataforma refatorada.
> Um relatório consolidado de reservas, com colunas configuráveis e exclusão em massa, embutido
> na seção **Bookings** como um modo "Recapitulative". Parte da convergência
> (ver [../../AUDITORIA_CONVERGENCIA.md](../../AUDITORIA_CONVERGENCIA.md) §5). Data: 2026-07-04.

## 1. Contexto e objetivo

O monólito tem, dentro de **Bookings**, um modo **"Recapitulative"** (toggle Bookings↔Recap): uma
tabela-relatório de todas as reservas, com **colunas configuráveis** (ordem/visibilidade),
**seleção múltipla + exclusão em massa** e import CSV. Na produção ela também sincroniza com o
**Cloudflare/D1** (`_recapApiLoad`, `_recapApiPushRow`, `_recapPrefsPush/Load`, `_recapCloudResync`,
`_migrateAllToD1`) — plumbing que a plataforma (Supabase-only) não usa.

A plataforma não tem a feature (gap §5, ~18 funções só-monólito). Objetivo: portar o **núcleo**
(relatório + colunas configuráveis + exclusão em massa) rodando sobre os dados que a plataforma já
tem, **preservando a UX/UI**, e **dropando** o plumbing Cloudflare.

## 2. Decisões (validadas com o usuário)

1. **Dados/escopo:** núcleo sobre os dossiês da plataforma (localStorage/Supabase já hidratado);
   **dropar Cloudflare/D1** (mesma linhagem de Vols/COMMS).
2. **Peças opcionais:** incluir **Bulk delete** (seleção múltipla → excluir localmente); **NÃO**
   incluir o **import CSV** (depende do DXR `openDossierDrawer`, ainda não portado, e é de nicho).
3. **Persistência das prefs de coluna:** `localStorage` (`expatur_recap_cols`), como o default do
   monólito. (Não sincroniza entre postos — decisão de simplicidade.)
4. **Entrada: fiel à produção — Recap LIGADO por default, substitui o conteúdo de Bookings**
   (`window.__RECAP_ENABLED = true`). **Sem** botão de toggle visível (como no monólito). A view de
   Bookings das fases fica atrás do flag; reversível por `window.recapDisable()` (console), e as
   funções `recapEnable/recapDisable` são preservadas.

## 3. Onde vive (embed em Bookings)

Fiel ao monólito: o Recap **substitui o conteúdo de** `section-bookings` por default, não é uma
seção nova nem um toggle opcional.
- `recap.js` injeta (via JS, sem tocar no `index.html`) um `<div id="recap-view">` dentro de
  `#section-bookings` e um `<style>` que, com a classe `.recap-on` no `#section-bookings`,
  **esconde** as views normais (`.bk-toolbar`, `#bk-main-view`, `#bookings-detail`) e **mostra**
  `#recap-view`. (Todos esses ids/classes já existem no `index.html` da plataforma — confirmado.)
- **Feature flag:** `window.__RECAP_ENABLED` inicia `true` (default de produção). `_applyOn()`
  adiciona/remove `.recap-on` e troca o título "Bookings"↔"Recapitulative"; com o flag ligado,
  abrir Bookings renderiza o Recap (`_render()`); desligado (`recapDisable()`), volta a
  `bookingsRender()`. Sem UI de toggle (fiel ao monólito — reverter é via console).
- Hook em `sidebarGo('bookings')`: ao (re)abrir Bookings, reaplica o modo corrente (`_applyOn`).

## 4. Modelo de dados (linha por dossiê)

Cada linha do relatório é derivada de um dossiê (varre `expatur_dossier_list` → `expatur_dossier_<id>`
+ `expatur_billet_<ref>`), reusando a mesma lógica do monólito (funções internas ao módulo, portadas):
- **Tipo de voo:** One Way / Round Trip / Open Jaw / Multi-City (`_typeLabel` a partir de `tripType`
  e da reversão dos trechos).
- **PNRs:** do billet (pax-level PNR; fallback master/leg PNR) — `_pnrsOf`.
- **Trecho (Leg):** origem→destino (`_legsOf`/`_legRoute`).
- **Financeiro:** Deal Value (reusa `_diDealValue` da plataforma) e **RAV bruto/líquido** (margem:
  `netSellBRL - totalCostBRL`, já computada no app.js:5191 — a implementação confirma a fonte exata
  dos custos por dossiê e porta o cálculo do recap se necessário).
- **Datas/pax:** `bookingDate` (`_fmtDMY`), `pax` (`_paxDisp`) — helpers internos do módulo.

## 5. Colunas configuráveis

`RECAP_COL_DEFS` — 9 colunas padrão (ordem inicial): **Booking Date · Dossier · Deal Value ·
Passenger · Airline · PNR · Leg · RAV B. · RAV L.** Cada uma com `id`, `label`, largura e `cell(b)`.
- **Config:** ordem e visibilidade por coluna, persistidas em `localStorage['expatur_recap_cols']`
  (`{order:[ids], hidden:[ids]}`). UI: gerenciador de colunas (checkbox mostrar/ocultar + ↑/↓ mover)
  no menu ⋮, com **Réinitialiser les colonnes** (limpa a chave → volta ao default).
- Funções: `_recapColToggle(id)`, `_recapColMove(id,dir)`, `_recapColsReset()`, `_recapColsCfg()`,
  `_recapColsSave(cfg)` — portadas verbatim (só a persistência cloud `_recapPrefsPush` é removida).

## 6. Exclusão em massa (Bulk delete)

Modo de seleção múltipla (`window._recapBulkToggle`): checkboxes por linha (`_sel` = ref→true),
barra com **Delete Selected**. `_doDelete()` confirma e exclui **localmente** cada ref
(`expatur_dossier_list` + `expatur_dossier_<id>` + `expatur_deals_meta`), reusando o delete local do
monólito. **Dropar** o `_deleteD1` (Cloudflare). Após excluir, re-renderiza.

## 7. Menu de ações (⋮)

Portar o menu, **mantendo**: Actualiser (re-render), Sélection multiple (Bulk Edit), Réinitialiser
les colonnes. **Remover**: Re-synchroniser (cloud), Migrer collections → D1, Importer un dossier
(CSV). O gerenciador de colunas fica no mesmo popover.

## 8. Fora de escopo (dropado)

- Todo o sync Cloudflare/D1: `_recapApiLoad`, `_recapApiPushRow`, `_recapPrefsPush/Load`,
  `_recapCloudResync`, `_recapRefreshCloud`, `_migrateAllToD1`, `EXPATUR_API`.
- **Import CSV** (`_recapImpInit`, `_recapImportPick`, `#recap-import-file`) — depende do DXR
  (`openDossierDrawer`) e é de nicho; entra junto do DXR se desejado no futuro.
- Persistência das prefs de coluna na nuvem (fica em localStorage).

## 9. Arquivos e integração

- `src/js/recap.js` — módulo: injeção do `#recap-view` + toggle, `RECAP_COL_DEFS`, render
  (`_render`/`window._recapRender`/`recapRefresh`), config de colunas, bulk delete, menu ⋮, e os
  row-builders internos (`_typeLabel`, `_pnrsOf`, `_legRoute`, `_fmtDMY`, `_paxDisp`, RAV). Exporta
  `window.recapEnable/recapDisable/_recapRender/recapRefresh` e os handlers `window._recap*`.
- `index.html` — **sem alteração** (o `recap.js` injeta o `#recap-view` e o `<style>` via JS; o
  flag `__RECAP_ENABLED` liga o modo por default).
- `src/js/main.js` — importar `recap.js` (depende de `app.js` para dossiê/billet/`_diDealValue`/
  `bookingsRender`/`sidebarGo`; carregar depois deles).

Sem migration, sem Edge Function, sem backend novo.

## 10. Pontos a verificar na implementação

- **Fonte exata do RAV bruto/líquido por dossiê** na plataforma (o app.js computa `ravBrut` em
  contexto de cost-calc; confirmar como o recap obtém custo/venda por dossiê — reusar o cálculo da
  plataforma ou portar o do recap). Se a fonte não existir por dossiê, a coluna cai para "—".
- **`_billet`/deal-value/`bookingsRender`/`sidebarGo`** — confirmar as assinaturas na plataforma
  (nomes efetivos em runtime).
- **Ordem de import** em `main.js` (recap depois de app.js e dos módulos de fase).
- **Colisão de nomes:** garantir que os helpers internos do recap (`_fmtDMY`, `_paxDisp`, etc.) não
  conflitam com globais existentes do app.js (encapsular no módulo).

## 11. Critérios de teste

1. `npm run build` verde.
2. Abrir **Bookings** → mostra o relatório Recap por default (flag ON); `window.recapDisable()` no
   console volta à view de Bookings das fases, `recapEnable()` retorna ao Recap.
3. A tabela lista as reservas com as 9 colunas; valores (data, dossiê, deal value, pax, cia, PNR,
   trecho, RAV B./L.) coerentes com os dossiês.
4. Ocultar/mostrar e reordenar colunas persiste (reabrir mantém); Réinitialiser volta ao default.
5. Bulk Edit: selecionar 2+ reservas → Delete Selected → excluídas localmente e somem do relatório
   e de Bookings; confirma antes.
6. Recarregar a página mantém a config de colunas.
7. Nenhuma chamada de rede Cloudflare; sem erro no console.
