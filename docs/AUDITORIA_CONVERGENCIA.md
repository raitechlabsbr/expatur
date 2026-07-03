# Auditoria de Convergência — Plataforma × `monolito.html` (produção)

> Comparação função-a-função entre a **plataforma refatorada** (`index.html` + `src/js/*`)
> e o **sistema de produção** `docs/monolito.html` (~4.9 MB), tratado como fonte de verdade.
> Gerada em 2026-07-03 · Branch `feature/backoffice-specs`.

## Sumário executivo

- A refatoração **preservou fielmente** a maior parte do código de produção: **1.587 funções são idênticas** (byte-a-byte, ignorando espaços/comentários).
- A divergência é **bidirecional**: a plataforma tem patches próprios (`_v378`–`_v399`, o trabalho das 10 fases) que o monólito não tem; o monólito tem patches (`_v346`/`_v354`/`_v360`) e **features inteiras** que a plataforma não tem. **Nenhuma base é superconjunto da outra** — por isso "adotar o monólito" cegamente regrediria as fases, e "ignorar o monólito" mantém regressões de produção.
- **2 regressões já confirmadas** por leitura de código (ver §4). Há mais **~50 divergências onde o monólito tem mais lógica** que ainda precisam de leitura par-a-par.
- **5 features de produção ausentes** na plataforma (Vols, COMMS, DXR, Recap, Ledger de fornecedores) + 1 link de menu (Quotes).

## 1. Método e confiança

- Extração por **AST (acorn)**: cada `<script>` do monólito (186/187 parseados) e cada arquivo `src/js/*.js` (todos parseados) → mapa `nome → corpo da função`. Cobre `function NAME`, `NAME = function`, `window.NAME = function`, métodos de objeto.
- Comparação com corpo **normalizado** (sem espaços/comentários).
- **Confiança alta**: contagem idênticas / só-num-lado / nomes por módulo.
- **Confiança média** (precisa de olho humano): a lista de "divergências" de corpo. Ambas as bases **redefinem funções em cadeia** (patches `vNNN` + overrides de módulo em runtime). O extrator guarda a *última* definição por arquivo; a função *efetiva* em runtime depende da ordem de carga (`main.js`). Logo, cada divergência abaixo é **candidata** até ser lida par-a-par. Exemplos: `csvDoImport` e `cliApplyScanData` parecem "esvaziadas" no `app.js` mas são **sobrescritas** por `ui-fixes.js` / `documents.js`.

## 2. Convergência quantitativa

| Métrica | Valor |
|---|---:|
| Funções no monólito | 2.517 |
| Funções na plataforma | 2.022 |
| Compartilhadas (mesmo nome) | 1.775 |
| — idênticas | **1.587** |
| — divergem no corpo | **188** |
| Só no monólito | **742** |
| Só na plataforma | **247** |

## 3. Divergências (188) — onde vive a versão da plataforma

| Local da versão-plataforma | Qtd | Natureza |
|---|---:|---|
| `app.js` | 170 | Mesma linhagem → **drift real** (a investigar) |
| Módulos de fase (`dashboard`, `storage`, `documents`, `client-picker`, `autosave`, `programs`, `permissions`, `deal-status`, `ui-fixes`, `main`) | 18 | Override **intencional** da refatoração |

Distribuição do drift por módulo (aprox., por prefixo): Ticketing/Devis 13 · Patches vNNN 12 · Tarefas 6 · Tarification/CostCalc 5 · Billet/Emissão 4 · Dashboard 4 · Auth 3 · Emissão/Fornecedores 3 · Clientes 2 · Financeiro 1 · Bookings 1 · "Outros" 132 (helpers genéricos + não classificados).

## 4. Regressões confirmadas (lidas par-a-par)

> **Estado:** §4.1 e §4.2 **CORRIGIDAS** em 2026-07-03 (port da versão de produção; build verde).
> **Correção de método importante:** a versão *efetiva* de `deleteTask` em runtime é `window.deleteTask`
> (app.js:15793), não o método `taskStore.deleteTask` (13857) que o diff AST casou por "last-wins".
> A regressão foi reconfirmada no ponto efetivo antes de editar. **Cada um dos 170 drifts restantes
> precisa do mesmo rastreio par-a-par (assignments em window + ordem de carga) antes de agir.**

### 4.1 `autoInjectFormalites` — regras R.D./Suriname (doc4) ✅ CORRIGIDA
A produção faz **duas coisas que a plataforma perdeu**:
1. **Auto-remoção** das linhas de formalidade (VFS Suriname, Déclaration ICF/QR) quando o itinerário muda e a condição deixa de valer (sem PBM/SDQ/PUJ). Na plataforma, mudar o itinerário **deixa linhas órfãs** no orçamento.
2. **Trava da quantidade** das linhas auto-gerenciadas ao nº de passageiros: ao mudar o pax, a produção atualiza a quantidade; a plataforma **mantém quantidade defasada**.
3. Menor: produção normaliza nomes com `.normalize('NFC')` (casamento robusto de "déclaration" acentuado).

### 4.2 `deleteTask` — exclusão de tarefa ✅ CORRIGIDA
A produção aceita a chamada legada **com um só argumento** `deleteTask(id)` (usada por botões inline): resolve o dossiê e faz varredura universal em `tasks_v2_*`. A plataforma exige `(ref, taskId)`; chamada com um argumento, `taskId` fica `undefined` e **nada é excluído** (falha silenciosa).

### 4.3 Passe fino — módulos de dinheiro (Financeiro / Billet / Cost Calc) ✅ concluído

Rastreio par-a-par das versões *efetivas* (última def / `window.X=`). Regressões confirmadas.
**Estado:** R5/R6/R7 **CORRIGIDAS** em 2026-07-03 (port de produção; build verde). R3/R4 aguardam
decisão de negócio (client-facing). Achado-bônus em R6: o `_restoreCCRows317` da plataforma **nem
restaurava os valores** (prog/forn/vol/cpm/fee/ext) — só re-populava os selects de trecho, casando por
`rid` que nunca casa; a versão de produção restaura tudo por índice e recria linhas faltantes.

| # | Função | Achado | Classe | Deps na plataforma |
|---|---|---|---|---|
| R3 ✅ | `_buildInvoiceItems` | Produção **itemiza** a fatura (1 linha/categoria de pax + linhas custom via `_buildPaxInvoiceItems119`, quando somam o total; senão linha única). Plataforma devolvia **linha única lump**. **CORRIGIDA** (decisão de negócio: restaurar itemização). | Regressão client-facing | `_buildPaxInvoiceItems119` ✅ |
| R3b ✅ | `_buildPaxInvoiceItems119` | Dependência de R3, **também regredida**: plataforma não excluía passageiros offert/preço-0 nem **anexava as linhas customizadas** (formalidades/extras) com dedup NFC. Sem isso o `_sum` de R3 nunca bate o total → R3 cairia sempre no fallback lump. **CORRIGIDA.** | Regressão client-facing (dep de R3) | `getCustomLines` ✅ |
| R4 ✅ | `_buildInvoicePayload` | Ramo de fatura única: produção manda centavos Stripe **por quantidade × unitário**; plataforma forçava `quantity:1`. Ligado a R3. **CORRIGIDA.** | Regressão client-facing | ✅ |
| R5 ✅ | `_saveCCRows317` | Produção preserva valores reais que revertem durante rebuild async (fournisseur/Trecho) + nunca sobrescreve com array vazio. Plataforma fazia `setItem` cego → **apagava linhas do Cost Calc**. **CORRIGIDA.** | Bug interno (custo/margem) | `_ccStorageKey317` ✅ |
| R6 ✅ | `_restoreCCRows317` | Faltava o flag `window._ccRestoringV32` (metade de R5) **e** a restauração dos valores por índice. **CORRIGIDA** (função inteira portada). | Bug interno | ✅ |
| R7 ✅ | `_getMilesLegs317` | Produção valida que o cache `#bl-body` pertence à **quote ativa** (`_domRef===_curRef`). Plataforma não → **voos vazavam entre cotações** no dropdown Trecho. **CORRIGIDA** (+ setter `legsRef` no bl-body). | Bug interno (cost calc errado) | ✅ |
| min | `ticketBlock` | Perdeu o botão por-trecho **copiar itinerário** (`copyLegItinerary`/`⧉`). | UX menor | `copyLegItinerary` a verificar |
| dep | `blSyncPnr` | Sincroniza o PNR master com o campo `cm-ref` do **COMMS**. Ausente porque COMMS não existe ainda. | Portar **junto com a feature COMMS** | — |
| ? | `_blGetAllLegs` | Cabeças idênticas; cauda diverge (detecção de cia/segmentos por trecho). | A investigar (leitura da cauda) | — |

Fora do escopo do passe fino (override de fase / muitas defs → provável intencional, checar versão efetiva se necessário): `emettreBillet` (override `deal-status.js`/`programs.js`), `finRefresh` (override `ui-fixes.js`/`auth.js`, 14 defs), `emSendInvoice`, `blSwitchTab`.

*(Os patches `_v354*`, `_v343*`, `_v118*` etc. são drift de linhagem — comparar por versão nos passes dos outros módulos.)*

### 4.5 Passe fino — Ticketing/Devis (persistência do dossier)

| # | Função | Achado | Estado |
|---|---|---|---|
| R8 ✅ | `_dossierSerializeCustomLines` + `_dossierLoad` + `_dossierResetUI` | **Cluster de id errado**: 3 funções buscavam `custom-line-row-` (não existe; o real é `custom-line-`, criado por `addCustomLine`). Consequência: **linhas custom (formalidades/extras) não eram persistidas, hidratadas nem resetadas**. **CORRIGIDA** (5 ocorrências → `custom-line-` + dedup NFC no serializer). | Corrigida |
| R9 ⚠️ | `_dossierSerializeMultiLegs` (+ reconstrução no load) | **Persistência multi-city quebrada nas duas pontas**: (a) serialize consultava ids inexistentes `#multi-legs-list`/`ml-*` → salvava `[]` (o comentário de produção confirma); (b) a plataforma **não tem** o bloco de reconstrução dos cards no load (monólito 13906-13925) **nem o modelo `flightSel`** (0 refs). É **divergência arquitetural** de como voos selecionados são persistidos — precisa de **passe dedicado**, não port cego. | **Aberto** |

### 4.6 Passe fino — módulos restantes (worklist, PENDENTE)

Próximos módulos a rastrear par-a-par (divergências das 188 por prefixo). Método: achar a versão
efetiva (última def / `window.X=` / override de fase) nos dois lados antes de editar.

- **Ticketing/Devis**: `parseSerpFlight`, `_dossierSerializeMultiLegs`, `_dossierSerializeCustomLines`, `_dossierSave`, `_dossierSetTripType`, `_dossierGetTripType`, `addMultiLeg`, `pushLeg`, `searchLeg`, `renderResultsFor`, `quotingSwitch`, `switchDossier`, `_diDealValue`, `_diOpenDossierFromIndex`, `devisIndexDuplicate`, `_ensureDossierForQuote`.
- **Money-adjacent (Outros)**: `autoSyncOpenInvoices`, `_syncPaiementClientFromDossier`, `_syncCostCalcRows313`, `_syncPayoutButton`, `_renderFornDetails330`, `_renderSupp322`, `_refreshNFValidateBtn`, `_validateNFNumber`, `_nf332InjectField`.
- **Tarefas**: `_taskCardHtml`, `toggleTask`, `_toggleTaskDoneFromPopup`, `_tpBuildToolbarHTML`, `_tpOpenCatManager`, `_tpRenderCatList`, `_tpTaskRow`, `_generateItinTasks`.
- **Clientes**: `cliApplyScanData` (override `documents.js` — verificar efetivo), `clientsViewProfile`, `cpmodSwitchTab`.
- **Dashboard/Welcome**: `_renderVolsSemaine104` (prov. regressão do widget), `_renderWelcomeTaskCardsFinal`, `_collectAllFlights104`, `_updateAllClocks`, `welcomeRefresh`, `_doRefreshLogos118`, `_updateVisibleLogos118`.
- **Bookings**: `_cardData`, `_allDossiers`, `_bkDate`, `_renderKanbanInto`, `_renderCard`, `_renderColumn`.
- **Minor UX (dinheiro) pendente**: `ticketBlock` (botão copiar itinerário), `_blGetAllLegs` (cauda: detecção cia/segmentos).

## 5. Inventário só-no-monólito (742) — o que falta portar

### Features completas ausentes
| Feature | Funções | Núcleo |
|---|---:|---|
| **COMMS** — email de confirmação | 28 | `openCommsPopup`, `_commsBuildEmailHTML`, `_commsSend`, `_commsFlightCardHTML`, multi-idioma FR/EN/ES, envio por pax/fundido |
| **DXR** — Dossier Command-Center Drawer | 28 | `openDossierDrawer`, `_dxrFinAdd/Persist/Recalc` (ledger), `_dxrMemoSave`, `_dxrOpenNF/SaveNF` (nota fiscal), `_dxrOpenTask`, `_dxrPassport` |
| **Ledger de fornecedores / "Abertos"** | ~29 | `_fornLedgerRowsAll`, `_fornPendingMap`, `_emPullAbertos/_emPushAbertos`, `fornEmissao*330`, `fornBookingRow*330`, `fornTogglePago330` (contas a pagar por fornecedor/emissão) |
| **Recap** — relatório de reservas | 18 | `_recapRender`, colunas configuráveis (`_recapColMove/Toggle/Cfg`), bulk-edit, import CSV (`_recapApiLoad`) |
| **Vols — Departures** | 18 | `_flightRowAdd/Save/Delete`, `_flightCsvServerLoad`, quadro compartilhado Cloudflare `ds=vols`, resolução de dossiê por PNR |

### Não são gaps (reimplementados)
- **FFP → Programas** (17 funções `_ffp*`/`ffp*`): mesma feature, migrada de Cloudflare `ds=ffp` para Supabase (migration 001).
- **Sync/Plumbing** (30 funções `_reconcile*`/`_mani*`/`_api*`/`_push`/`_pull`): reconciliação Cloudflare — a plataforma usa Supabase.
- Docs de booking (`_bkDocs*`) → `documents.js` (Fase 5).

## 6. Recomendação de estratégia de convergência

**Portar para a plataforma, preservando as fases** (não re-basear no monólito). Justificativa:
- 1.587 funções já idênticas ⇒ a plataforma **é** o monólito + 10 fases de valor (permissões/RLS, status canônico, timeline, backup, i18n). Re-basear jogaria fora esse trabalho e re-introduziria o débito do monólito.
- O trabalho vira uma lista finita e priorizável: **(a)** corrigir as regressões §4, **(b)** portar as 5 features §5, **(c)** varrer módulo a módulo os drifts restantes.
- Preserva ao máximo a UX/UI (as features do monólito já usam o mesmo design system).

## 7. Próximos passos

1. **Confirmar a estratégia** do §6 (decisão pendente do usuário).
2. **Passe fino módulo a módulo** dos 170 drifts do `app.js` (começando pelos de dinheiro: Financeiro, Billet/Emissão, Cost Calc) para separar regressão × override intencional — este documento cobre o backbone; o passe fino é o detalhamento.
3. **Corrigir regressões confirmadas** (§4.1, §4.2) — baixo custo, alto valor.
4. **Brainstorm + spec por feature** (§5), uma de cada vez, com as regras de negócio.
