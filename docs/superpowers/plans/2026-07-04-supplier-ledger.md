# Plano de Implementação — Ledger de Fornecedores / "Abertos"

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Objetivo:** Portar o ledger de fornecedores ("Abertos" / contas a pagar) do `docs/monolito.html`
para a plataforma: valor Em Aberto por fornecedor + detalhe por emissão + toggle Pago/Pendente, com
o **estado "pago" compartilhado via Supabase** (não Cloudflare).

**Arquitetura:** As linhas de custo vêm dos stores locais (`expatur_financeiro_lancamentos` +
`expatur_doss_finance_*`); só o **status pago/pendente** é compartilhado numa tabela Supabase
`supplier_payments` (por `source_id`) + Realtime — mesmo padrão da Vols (migration 008). O núcleo do
cálculo e o toggle local são port fiel do monólito; a camada de sync Cloudflare é **substituída** por
Supabase.

**Tech Stack:** Vanilla JS (ES modules, bridges `window.*`), Vite, Supabase
(`src/js/supabase-client.js`). Migration nova (009).

## Global Constraints

- **Sem test runner.** Verificação = `npm run build` verde + runtime + `supabase` (migration
  aplicada). Não inventar vitest/jest.
- **Fonte do código portado:** `docs/monolito.html` nos ranges citados; portar **verbatim** os
  trechos locais.
- **Dropar Cloudflare:** `_emPullAbertos`/`_emPushAbertos`/`_computeAbertos`(cloud)/`setInterval`/
  `_FLIGHT_CSV_SAVE_URL`/`_authHeaders`/`_pull`/`_push`. Nenhum `fetch` para Cloudflare.
- **Estado pago no Supabase:** tabela `supplier_payments`; toggle faz upsert; render carrega o mapa
  e aplica; Realtime reflete entre postos. Guardar todo caminho Supabase com `!SUPABASE_ENABLED`
  (degrada para local-only sem erro).
- **UI em francês** (idêntico ao monólito). Comentários em português.
- **Encapsular** helpers do módulo; exportar do app.js só o que faltar (sweep).
- **Não regenerar `app.js`** com extract.py — exports do sweep à mão.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase/migrations/009_supplier_payments.sql` | Tabela status pago + RLS + Realtime + índice | Criar |
| `src/js/supplier-ledger.js` | Ledger (rows/pendingMap/Em Aberto/detalhe), toggle local, camada Supabase (load/upsert/realtime) | Criar |
| `src/js/main.js` | Importar `supplier-ledger.js` | Modificar |
| `src/js/app.js` | Exportar helpers usados pelo módulo que faltem (sweep) | Modificar (Task 2) |

---

## Task 1: Migration 009 — `supplier_payments`

**Files:**
- Create: `supabase/migrations/009_supplier_payments.sql`
- Modify: `supabase/migrations/README.md` (entrada 9)

**Interfaces:**
- Produces (SQL, consumido por supplier-ledger.js): tabela `public.supplier_payments(source_id text
  pk, status text, dossier_ref text, paid_at timestamptz, updated_by uuid, updated_at timestamptz)`;
  leitura `select source_id, status from supplier_payments`; upsert `on conflict (source_id)`.

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/009_supplier_payments.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009 — Ledger de fornecedores ("Abertos"): estado Pago/Pendente
-- compartilhado por linha de custo (source_id). Substitui o sync Cloudflare
-- ds=emissao_pagos. Compartilhado total (RLS aberta p/ authenticated). Idempotente.
-- Spec: docs/superpowers/specs/2026-07-04-supplier-ledger-design.md
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.supplier_payments (
  source_id   text primary key,
  status      text not null default 'pendente' check (status in ('pago','pendente')),
  dossier_ref text not null default '',
  paid_at     timestamptz,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);

create index if not exists supplier_payments_dossier_idx on public.supplier_payments (dossier_ref);

alter table public.supplier_payments enable row level security;

drop policy if exists "supplier_payments_auth_all" on public.supplier_payments;
create policy "supplier_payments_auth_all" on public.supplier_payments
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Registrar no README**

Add to `supabase/migrations/README.md`:
```markdown
9. `009_supplier_payments.sql` — estado Pago/Pendente por linha de custo (ledger de fornecedores/Abertos) + RLS aberta + Realtime manual (feature Abertos)
```

- [ ] **Step 3: Verificação estática**

Run: `grep -c "if not exists\|create or replace\|drop policy if exists" supabase/migrations/009_supplier_payments.sql`
Expected: `3` ou mais (tabela + índice + policy drop).

- [ ] **Step 4: Aplicar no Supabase (controlador/usuário)**

A migration é aplicada via Management API (como a 008) ou SQL Editor. Após aplicar, habilitar
Realtime: `alter publication supabase_realtime add table public.supplier_payments;`. **Pausa** até
confirmado (a Task 3 precisa da tabela para o runtime; a Task 2 compila sem ela).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_supplier_payments.sql supabase/migrations/README.md
git commit -m "feat(abertos): migration 009 — supplier_payments (estado pago compartilhado)"
```

---

## Task 2: `supplier-ledger.js` — núcleo + toggle local (sem Supabase)

Porta o cálculo do ledger, a coluna Em Aberto, o detalhe e o toggle Pago/Pendente **local**.
Deliverable: Fornecedores mostra o Valor Em Aberto por fornecedor; o detalhe lista as contas a
pagar; o toggle alterna Pago/Pendente (persistindo no ledger local) e recomputa. Sem Supabase ainda.

**Files:**
- Create: `src/js/supplier-ledger.js`
- Modify: `src/js/main.js` (import)
- Modify: `src/js/app.js` (sweep — exportar helpers faltantes)

**Interfaces:**
- Consumes: `expatur_financeiro_lancamentos`, `expatur_doss_finance_*` (localStorage);
  `window.fornRender`, o sistema de colunas (`colRegisterRender`), `_fmtBRL*`/normalizadores do app.js.
- Produces: `window._fornLedgerRowsAll()`, `window._fornPendingMap(suppliers)`, `window._abertoFor(f)`,
  `window.fornTogglePago330(rowId, dossierRef)`, `window._emSetPago(sourceId, pagoStr)` (local), e a
  render do detalhe. (Task 3 envolve o toggle para o Supabase.)

- [ ] **Step 1: Criar `src/js/supplier-ledger.js` portando o núcleo**

Portar **verbatim** de `docs/monolito.html`:
- `_fornLedgerRowsAll` (16958–16970) e `_fornPendingMap` (16971–16984).
- A lógica da coluna **Em Aberto** / `_abertoFor` e a caixa "Total Em Aberto" (contexto ~16915–16945)
  — integrar com o `fornRender`/colunas da plataforma (ver Step 3).
- O **detalhe de contas a pagar** por fornecedor/emissão (render das linhas com valor + status +
  o botão toggle; monólito ~34990–35040).
- **`fornTogglePago330`** (34657 até o fim da função — inclui o flip no ledger global
  `expatur_financeiro_lancamentos` E nos `expatur_doss_finance_*`; confirmar o fim exato ao portar).
- `_emSetPago(sourceId, pagoStr)` — a versão **local** (atualiza o status; SEM o `_push`/`_apply`
  Cloudflare do monólito; a parte Supabase entra na Task 3).

Envolver tudo num IIFE de módulo. NÃO portar nada que referencie `EXPATUR_API`/`_FLIGHT_CSV_*`/
`_pull`/`_push`/`setInterval` (Cloudflare — dropado).

- [ ] **Step 2: Sweep de helpers do app.js (a classe de bug recorrente)**

O módulo referencia helpers do `app.js` (`fornRender`, `_fmtBRL*`, normalizadores de nome,
`colRegisterRender`). Fazer o sweep (como no DXR Task 2): coletar os identificadores que
`supplier-ledger.js` chama e não define, checar reachability (`window.X=` genuíno em app.js), e
exportar os faltantes no bloco de early-exports do app.js:
```javascript
  if (typeof <id> === 'function') window.<id> = <id>;
```
Documentar a tabela id→status→ação no report.

- [ ] **Step 3: Integrar a coluna "Em Aberto" com o `fornRender` da plataforma**

Conferir como a plataforma registra colunas (`colRegisterRender('forn', fornRender)` app.js:10075) e
o override de `fornRender` (app.js:26689, clique→detalhe). Integrar a coluna `valorAberto`/`_abertoFor`
e a caixa "Total Em Aberto" sem quebrar o render existente (seguir o padrão de coluna do monólito
~16943). Se a plataforma usa um registro de colunas, adicionar a coluna por lá; senão, sobrepor o
`fornRender` aditivamente.

- [ ] **Step 4: Importar no `main.js`**

Após `import './dxr.js';`, adicionar:
```javascript
import './supplier-ledger.js';
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: verde. `grep -nE "EXPATUR_API|_FLIGHT_CSV|fetch\(" src/js/supplier-ledger.js` → nada.

- [ ] **Step 6: Verificação runtime (local)**

`npm run dev` → Fornecedores. Expected: cada fornecedor mostra o Valor Em Aberto; o detalhe lista as
contas a pagar; toggle Pago/Pendente alterna e o Em Aberto recomputa (persistindo local). Sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/js/supplier-ledger.js src/js/main.js src/js/app.js
git commit -m "feat(abertos): ledger de fornecedores + toggle Pago/Pendente (local)"
```

---

## Task 3: Camada Supabase — estado pago compartilhado + Realtime

Substitui o sync Cloudflare por Supabase: carrega o mapa de status ao render, faz upsert no toggle,
e assina Realtime. Deliverable: marcar Pago num posto aparece em outro (Realtime / reabrir).

**Files:**
- Modify: `src/js/supplier-ledger.js` (append a camada Supabase + envolver o toggle)

**Interfaces:**
- Consumes: `supabase`, `SUPABASE_ENABLED` de `./supabase-client.js`; a tabela `supplier_payments`
  (Task 1); `_fornLedgerRowsAll`/`fornTogglePago330`/`fornRender` (Task 2).
- Produces: `window._abertosLoadStatus()` (async, hidrata o mapa e aplica ao ledger local),
  o wrap de `fornTogglePago330` que faz upsert, e a subscription Realtime.

- [ ] **Step 1: Adicionar o import e o load do mapa de status**

No topo de `supplier-ledger.js`: `import { supabase, SUPABASE_ENABLED } from './supabase-client.js';`
(se ainda não houver). Adicionar:
```javascript
// Carrega o mapa de status pago do Supabase e aplica sobre o ledger local
// (fonte autoritativa do pago — replica o "apply on reconcile" da produção).
async function _abertosLoadStatus() {
  if (!SUPABASE_ENABLED || !supabase) return;
  try {
    const { data, error } = await supabase.from('supplier_payments').select('source_id, status');
    if (error) { console.warn('[abertos] load', error.message); return; }
    const map = {};
    (data || []).forEach(r => { if (r.source_id) map[r.source_id] = r.status; });
    _applyStatusMap(map);   // sobrescreve pago/status das linhas locais por source_id
    if (typeof window.fornRender === 'function') window.fornRender();
  } catch (e) { console.warn('[abertos] load', e); }
}
window._abertosLoadStatus = _abertosLoadStatus;
```
`_applyStatusMap(map)` percorre `expatur_financeiro_lancamentos` (+ `expatur_doss_finance_*`) e, para
cada linha com `source_id` no mapa, seta `pago`/`status` = map[source_id]; grava de volta. (Porta a
ideia do `_apply` do monólito, mas a fonte é o Supabase.)

- [ ] **Step 2: Envolver `fornTogglePago330` para upsert no Supabase**

Após a definição do toggle local (Task 2), envolvê-lo (padrão do monólito 78363, mas gravando no
Supabase em vez do worker):
```javascript
(function _abertosWrapToggle() {
  const orig = window.fornTogglePago330;
  if (typeof orig !== 'function' || orig._abertosWrapped) return;
  const wrapped = function (rowId, dossierRef) {
    const ret = orig.apply(this, arguments);   // flip local
    try {
      if (rowId && SUPABASE_ENABLED && supabase) {
        // lê o status resultante da linha local e faz upsert
        let status = 'pendente';
        try {
          const g = JSON.parse(localStorage.getItem('expatur_financeiro_lancamentos') || '[]');
          const row = Array.isArray(g) ? g.find(x => x && (x.source_id === rowId || x.id === rowId)) : null;
          const p = String((row && (row.pago || row.status)) || '').toLowerCase();
          status = (p === 'pago' || p === 'paid') ? 'pago' : 'pendente';
        } catch (e) {}
        supabase.from('supplier_payments').upsert({
          source_id: rowId, status, dossier_ref: dossierRef || '',
          paid_at: status === 'pago' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'source_id' }).then(({ error }) => { if (error) console.warn('[abertos] upsert', error.message); });
      }
    } catch (e) { console.warn('[abertos] toggle', e); }
    return ret;
  };
  wrapped._abertosWrapped = true;
  window.fornTogglePago330 = wrapped;
})();
```

- [ ] **Step 3: Realtime + load inicial**

Adicionar a subscription (padrão de `permissions.js`/`vols.js`) e o load ao abrir Fornecedores:
```javascript
function _abertosSubscribeRealtime() {
  if (!SUPABASE_ENABLED || !supabase || _abertosSubscribeRealtime.__done) return;
  _abertosSubscribeRealtime.__done = true;
  try {
    supabase.channel('abertos-supplier-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_payments' }, () => { _abertosLoadStatus(); })
      .subscribe();
  } catch (e) { console.warn('[abertos] realtime', e); }
}
_abertosSubscribeRealtime();
// Hook: ao abrir Fornecedores, hidratar o status do Supabase
(function _abertosHookForn() {
  const prev = window.sidebarGo;
  if (typeof prev !== 'function' || prev._abertosHooked) return;
  const w = function (section) { const r = prev.apply(this, arguments); if (section === 'fornecedores') { try { _abertosLoadStatus(); } catch (e) {} } return r; };
  w._abertosHooked = true; window.sidebarGo = w;
})();
```
(Se o wrap de `sidebarGo` colidir com outros wraps, seguir o padrão idempotente já usado — guardar
com o flag `_abertosHooked`.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: verde; `grep -nE "EXPATUR_API|_FLIGHT_CSV" src/js/supplier-ledger.js` → nada.

- [ ] **Step 5: Verificação runtime (compartilhado)**

Requer a migration 009 aplicada + Realtime. Em duas abas logadas: marcar Pago numa linha na aba A →
aparece na aba B (Em Aberto recomputa) em segundos; reabrir Fornecedores mantém o status do Supabase.

- [ ] **Step 6: Commit**

```bash
git add src/js/supplier-ledger.js
git commit -m "feat(abertos): estado pago compartilhado via Supabase + Realtime"
```

---

## Self-Review

**1. Cobertura da spec:**
- §2.1 pago compartilhado Supabase → Task 1 (tabela) + Task 3 (upsert/load/realtime). ✓
- §2.2 dropar Cloudflare → Global Constraints + Task 2 Step 1 (não portar cloud). ✓
- §3 modelo de dados → Task 1. ✓
- §4 cálculo do ledger (rows/pendingMap/Em Aberto/detalhe) → Task 2. ✓
- §5 toggle (local + Supabase) → Task 2 (local) + Task 3 (upsert/realtime). ✓
- §6 arquivos → Tasks 1–3. ✓
- §7 pontos a verificar (integração fornRender, sweep, source_id, guardas) → Task 2 Steps 2/3 +
  Global Constraints. ✓
- §9 critérios de teste → verificações runtime das Tasks 2–3. ✓

**2. Placeholders:** o SQL da 009 e o código Supabase (load/upsert/realtime) estão completos; os
trechos "portar verbatim 16958–16984 / 34657 / ~34990–35040" apontam código real em local exato com
as remoções nomeadas. O sweep (Task 2 Step 2) é procedimento concreto (produz a lista). Não há TODO
vago.

**3. Consistência de tipos/nomes:** `source_id` é a chave em todos os pontos (ledger local, toggle,
`supplier_payments`, upsert, `_applyStatusMap`). `window.fornTogglePago330` é produzido na Task 2 e
envolvido na Task 3. `_abertoFor`/`_fornPendingMap` consomem o `pago`/`status` que o
`_applyStatusMap` (Task 3) sobrescreve a partir do Supabase.

## Handoff de execução

**Plano completo e salvo em `docs/superpowers/plans/2026-07-04-supplier-ledger.md`. Duas opções:**

**1. Subagent-Driven (recomendado)** — despacho um subagente por task, reviso entre elas.

**2. Execução Inline** — executo nesta sessão com executing-plans, em lote com checkpoints.

**Qual abordagem?**
