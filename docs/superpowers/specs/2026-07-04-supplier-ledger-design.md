# Design — Feature Ledger de Fornecedores / "Abertos" (contas a pagar)

> Porte da feature **ledger de fornecedores ("Abertos")** do `docs/monolito.html` (produção) para a
> plataforma. Contas a pagar por fornecedor, com toggle Pago/Pendente, embutido na seção
> **Fornecedores**. É o **subsistema B do DXR** (o A, o drawer, já foi portado). Parte da
> convergência (ver [../../AUDITORIA_CONVERGENCIA.md](../../AUDITORIA_CONVERGENCIA.md) §5). Data: 2026-07-04.

## 1. Contexto e objetivo

O monólito calcula, por fornecedor, o **valor "Em Aberto"** (soma das linhas de custo ainda não
pagas) e mostra um detalhe de contas a pagar por emissão, com um **toggle Pago/Pendente** por linha.
Na produção, o estado "pago" (mapa `{source_id: 'pago'|'pendente'}`) é **sincronizado entre postos
via Cloudflare** (`ds=emissao_pagos`, push/pull + `setInterval` de 20s), aplicado sobre o ledger em
cada reconcile — para que o status de pagamento seja consistente em todas as máquinas.

A plataforma tem a seção **Fornecedores** (`fornRender`) mas **não** as funções do ledger
(`_fornLedgerRowsAll`, `_fornPendingMap`, `fornTogglePago330`) nem o sync (gap §5, ~29 fns só-monólito).

Objetivo: portar o **núcleo** (cálculo do Em Aberto + detalhe por emissão + toggle Pago/Pendente),
preservando a UX/UI, com o **estado "pago" compartilhado via Supabase** (não Cloudflare).

## 2. Decisões (validadas com o usuário)

1. **Estado "pago": Supabase compartilhado** (decisão do usuário) — um posto marca Pago → todos
   veem. Substitui o Cloudflare `ds=emissao_pagos`. As *linhas* de custo continuam derivadas dos
   stores locais; **só o status pago/pendente** é compartilhado (igual à produção, que só sincroniza
   o mapa de status).
2. **Dropar Cloudflare:** `_emPullAbertos`/`_emPushAbertos`/`_computeAbertos` (parte cloud)/`setInterval`
   e o plumbing `_FLIGHT_CSV_SAVE_URL`/`_authHeaders`.
3. **Backend:** tabela Supabase + RLS + Realtime (mesmo padrão da Vols, migration 008).

## 3. Modelo de dados (Supabase)

Tabela `public.supplier_payments` — **uma linha por linha de custo** (chaveada pelo `source_id`
estável, ex.: `costcalc_line__dos_*__n`):

| coluna | tipo | notas |
|---|---|---|
| `source_id` | text primary key | id estável da linha de custo (do ledger local) |
| `status` | text not null default 'pendente' | `pago` \| `pendente` |
| `dossier_ref` | text not null default '' | ref de origem (para filtrar/abrir) |
| `paid_at` | timestamptz | quando marcado pago (null se pendente) |
| `updated_by` | uuid default auth.uid() | |
| `updated_at` | timestamptz not null default now() | |

- **RLS:** habilitada; policy única `for all to authenticated using (true) with check (true)` —
  compartilhado total (como `flights`). Sem restrição por dono.
- **Realtime:** `alter publication supabase_realtime add table public.supplier_payments;` — o toggle
  num posto reflete nos outros ao vivo.
- **Upsert:** `on conflict (source_id) do update set status/paid_at/updated_*` — idempotente.
- Migration: `supabase/migrations/009_supplier_payments.sql` (009 = próxima após a 008 aplicada).

O mapa de status é a **fonte autoritativa** do pago: ao render, carrega-se
`select source_id, status from supplier_payments` e aplica-se sobre as linhas do ledger local (o
`pago`/`status` da linha local é sobrescrito pelo do Supabase quando existir) — replica o
"apply on every reconcile" da produção.

## 4. Cálculo do ledger (port do núcleo, local)

- **`_fornLedgerRowsAll()`** (porta de monólito 16958): coleta as linhas de custo de
  `expatur_financeiro_lancamentos` + `expatur_doss_finance_*` (dedup por `source_id`). Cada linha:
  `source_id`, `fornecedor`/`fornecedor_id`, `pago`/`status`, e campos de valor
  (`volume_miles`/`cpm_brl`/`taxas_brl` ou `brl_amount`/`amount`/`valor`).
- **`_fornPendingMap(suppliers)`** (16971): soma as linhas **não pagas** por fornecedor (chave =
  nome normalizado, ou por `fornecedor_id`) → `{ nomeNorm: valorEmAberto }`. O `pago` de cada linha
  é o do Supabase aplicado (§3).
- **Coluna "Em Aberto"** em `fornRender` (`valorAberto`/`_abertoFor` → `_fornPendingMap`) + a caixa
  **"Total Em Aberto Fornecedor"**.
- **Detalhe por fornecedor/emissão:** a tabela de contas a pagar (linhas com valor + status) com o
  toggle Pago/Pendente por linha (render em ~35020 do monólito).

## 5. Toggle Pago/Pendente (Supabase)

`fornTogglePago330(rowId, dossierRef)` (porta de monólito 34657, com o wrap de 78363):
1. Alterna o status da linha `source_id=rowId` (pago ↔ pendente) no ledger local
   (`expatur_financeiro_lancamentos`), via `_emSetPago`.
2. **Upsert no Supabase** `supplier_payments` (`source_id`, `status`, `paid_at`, `dossier_ref`) —
   substitui o `_emPushAbertos` (Cloudflare).
3. Re-render (Em Aberto recomputa). **Realtime** reflete em outros postos.

Ao abrir Fornecedores: carrega o mapa de status do Supabase (substitui `_emPullAbertos`) e aplica
antes de renderizar. Subscription Realtime no canal `supplier_payments` re-renderiza ao vivo.

## 6. Arquivos e integração

- `supabase/migrations/009_supplier_payments.sql` — tabela + RLS + Realtime + índice.
- `src/js/supplier-ledger.js` — módulo: `_fornLedgerRowsAll`, `_fornPendingMap`, `_abertoFor`,
  `fornTogglePago330` (+ `_emSetPago`), o detalhe de contas a pagar, e a camada Supabase
  (load do mapa de status, upsert no toggle, Realtime). Integra com `fornRender` (coluna Em Aberto).
- `src/js/app.js` — se `fornRender`/colunas precisarem, exportar helpers faltantes (sweep, como no DXR).
- `src/js/main.js` — importar `supplier-ledger.js` (depois de `app.js`/`supabase-client.js`).
- `index.html` — provavelmente **sem alteração** (a coluna e o detalhe são injetados por JS via
  `fornRender`/colRegisterRender); confirmar na implementação.

## 7. Pontos a verificar na implementação

- **Integração com `fornRender`:** como a plataforma registra colunas (`colRegisterRender('forn', …)`
  em app.js:10075) e onde a coluna "Em Aberto" entra; o override de `fornRender` da plataforma
  (app.js:26689) para o clique→detalhe. Portar sem quebrar o render existente.
- **Helper sweep (a classe de bug do COMMS/Recap/DXR):** o módulo referencia helpers do app.js
  (`fornRender`, `_fmtBRL*`, normalizadores, colunas). Varrer e exportar os que faltarem em `window`.
- **`source_id` estável:** confirmar que as linhas de custo da plataforma têm `source_id` (o toggle
  e o Supabase dependem dele). Se algumas não tiverem, tratar (fallback id) — documentar.
- **Guardas Supabase:** todo caminho Supabase guardado por `!SUPABASE_ENABLED` (degrada para
  local-only sem erro).
- **Número da migration:** 009 (008 já aplicada).

## 8. Fora de escopo

- Todo o sync Cloudflare (`_emPull/PushAbertos`, `setInterval`, `_FLIGHT_CSV_*`).
- Reescrever o Financeiro/Fornecedores da plataforma — o ledger **reusa** os stores locais e a
  seção existente.
- Fluxo de pagamento (registrar valor pago parcial etc.) — só o toggle Pago/Pendente, como a produção.

## 9. Critérios de teste

1. `npm run build` verde; migration 009 aplicada (tabela + RLS + Realtime).
2. Abrir **Fornecedores** → cada fornecedor mostra o **Valor Em Aberto** (soma das linhas não pagas);
   a caixa "Total Em Aberto" bate.
3. Abrir o detalhe de um fornecedor → lista as contas a pagar por emissão com status.
4. **Toggle Pago/Pendente** numa linha → o Em Aberto recomputa; persiste no Supabase.
5. **Compartilhamento:** marcar Pago num posto → aparece em outro (Realtime / reabrir).
6. Linhas sem `source_id` não quebram o cálculo.
7. Sem chamada Cloudflare; sem erro no console.
