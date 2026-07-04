# Plano de Implementação — Feature Vols (Departures)

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para rastreio.

**Objetivo:** Portar a feature "Vols — Departures" do `docs/monolito.html` (produção) para a
plataforma refatorada, com backend **Supabase** (tabela + RLS + Realtime), preservando a UX/UI.

**Arquitetura:** Um módulo ES novo `src/js/vols.js` mantém um cache em memória (`_volsRows`)
hidratado do Supabase e mantido vivo por Realtime — igual ao padrão de `permissions.js`
(`_usersCache` + canal `postgres_changes`). As funções de render são **síncronas** (leem o cache),
para casar com o `sidebarGo` síncrono do `app.js`. Escritas (manual, emissão, seed) chamam uma
função SQL `flights_upsert` que faz o merge/dedupe server-side (enriquece linha sem sobrescrever
com vazio). O widget "Vols de la semaine" do dashboard **converge** para ler do mesmo cache.

**Tech Stack:** Vanilla JS (ES modules, bridges `window.*`), Vite (`npm run build`),
Supabase (`@supabase/supabase-js` já instalado; cliente em `src/js/supabase-client.js`).

## Global Constraints

- **Sem test runner no repo.** Verificação = `npm run build` verde (Vite/terser) + checagem
  runtime no browser (critérios da spec §9). Não inventar vitest/jest. Copiado do método usado
  nas 11 regressões desta branch ("build verde" + "requer teste runtime").
- **Migrations aplicadas à mão** no SQL Editor do Supabase (projeto `jjmnczfrjnbqwfktevoh`),
  em ordem numérica. Todo `.sql` deve ser **idempotente** (`if not exists` / `create or replace` /
  `drop policy if exists`). Ver `supabase/migrations/README.md`.
- **Não regenerar `app.js`** com extract.py — editar à mão (memória do projeto).
- **Idioma da UI:** rótulos em francês, idênticos ao monólito (a plataforma segue esse padrão nas
  telas herdadas). Comentários de código em português.
- **Backend único Supabase** — sem Cloudflare Worker (os `_flightCsv*ServerLoad`/`_FLIGHT_CSV_SAVE_URL`
  do monólito NÃO são portados; a fonte é a tabela `flights`).
- **Cliente Supabase:** `import { supabase, SUPABASE_ENABLED } from './supabase-client.js';`
  Todo caminho que usa Supabase deve degradar sem erro quando `!SUPABASE_ENABLED` (guardar com
  `if (!SUPABASE_ENABLED || !supabase) return;`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase/migrations/008_flights.sql` | Tabela `flights` + RLS + unique + índice + função `flights_upsert` | Criar |
| `supabase/migrations/README.md` | Entrada do item 8 | Modificar |
| `index.html` | Item de sidebar `snav-vols` + bloco `section-vols` | Modificar |
| `src/js/vols.js` | Módulo: cache, load, render tabela, CRUD, realtime, seed, captura na emissão, dados do widget | Criar |
| `src/js/app.js` | Adicionar `'vols'` a `SECTION_IDS` + refresh de `section-vols` no `sidebarGo` | Modificar |
| `src/js/main.js` | Importar `./vols.js` | Modificar |
| `src/js/dashboard.js` | Convergir `_renderFlights` para ler do cache de `vols.js` | Modificar |

---

## Task 1: Migration — tabela `flights` + RLS + `flights_upsert`

**Files:**
- Create: `supabase/migrations/008_flights.sql`
- Modify: `supabase/migrations/README.md`

**Interfaces:**
- Produces (SQL, consumidos por `vols.js`):
  - Tabela `public.flights (id uuid, flight_date date, flight_num text, dep_code text, dep_time text, arr_code text, arr_time text, pnr text, client text, dossier_ref text, source text, created_by uuid, created_at timestamptz)`.
  - RPC `public.flights_upsert(rows jsonb) returns void` — cada elemento de `rows` é um objeto com as chaves de coluna (menos `id`/`created_at`); faz insert com merge on-conflict (enriquece campos vazios, nunca sobrescreve valor bom com vazio).
  - Query de leitura do board: `select * from flights where flight_date >= current_date order by flight_date, dep_time`.

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/008_flights.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008 — Vols (Departures): quadro de partidas compartilhado.
-- Uma linha por segmento de voo. Compartilhado total entre postos (RLS aberta
-- p/ authenticated). Populado por: emissão (source='emit'), manual ('manual'),
-- seed único das reservas existentes ('seed'). Idempotente.
-- Spec: docs/superpowers/specs/2026-07-03-vols-departures-design.md
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.flights (
  id          uuid primary key default gen_random_uuid(),
  flight_date date not null,
  flight_num  text not null default '',
  dep_code    text not null default '',
  dep_time    text not null default '',
  arr_code    text not null default '',
  arr_time    text not null default '',
  pnr         text not null default '',
  client      text not null default '',
  dossier_ref text not null default '',
  source      text not null default 'manual',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Dedupe: uma linha por (data, voo, origem, destino, pnr). Colunas de chave são
-- NOT NULL default '' para o índice unique nunca ver NULL (NULLs são distintos).
create unique index if not exists flights_dedupe_key
  on public.flights (flight_date, flight_num, dep_code, arr_code, pnr);

-- Query do board e do widget da semana filtram por data.
create index if not exists flights_flight_date_idx on public.flights (flight_date);

-- ── RLS: compartilhado total (decisão 3 da spec) ────────────────────────────
alter table public.flights enable row level security;

drop policy if exists "flights_auth_all" on public.flights;
create policy "flights_auth_all" on public.flights
  for all to authenticated using (true) with check (true);

-- ── Upsert com merge server-side (replica o dedupe/enriquecimento do Worker) ──
-- Para cada linha: insere; em conflito na chave de dedupe, preenche client/
-- dossier_ref/dep_time/arr_time/flight_num APENAS se estiverem vazios na linha
-- existente (uma emissão mais completa enriquece; nunca sobrescreve com vazio).
create or replace function public.flights_upsert(rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    insert into public.flights
      (flight_date, flight_num, dep_code, dep_time, arr_code, arr_time, pnr, client, dossier_ref, source)
    values (
      (r->>'flight_date')::date,
      coalesce(r->>'flight_num',''),
      coalesce(r->>'dep_code',''),
      coalesce(r->>'dep_time',''),
      coalesce(r->>'arr_code',''),
      coalesce(r->>'arr_time',''),
      coalesce(r->>'pnr',''),
      coalesce(r->>'client',''),
      coalesce(r->>'dossier_ref',''),
      coalesce(r->>'source','manual')
    )
    on conflict (flight_date, flight_num, dep_code, arr_code, pnr) do update set
      client      = case when flights.client      = '' then excluded.client      else flights.client      end,
      dossier_ref = case when flights.dossier_ref = '' then excluded.dossier_ref else flights.dossier_ref end,
      dep_time    = case when flights.dep_time     = '' then excluded.dep_time     else flights.dep_time     end,
      arr_time    = case when flights.arr_time     = '' then excluded.arr_time     else flights.arr_time     end,
      flight_num  = case when flights.flight_num   = '' then excluded.flight_num   else flights.flight_num   end;
  end loop;
end;
$$;
```

- [ ] **Step 2: Registrar no README**

In `supabase/migrations/README.md`, add after the item `7.` (before the ⚠️ notes block), a new line:

```markdown
8. `008_flights.sql` — quadro de partidas `flights` (Vols) + RLS aberta p/ authenticated + `flights_upsert` (merge server-side) (feature Vols)
```

- [ ] **Step 3: Verificar que o SQL é válido e idempotente (leitura)**

Não há CLI de DDL (README diz aplicar à mão). Verificação estática: reler o arquivo e conferir
que todo objeto usa `if not exists` / `create or replace` / `drop ... if exists`. Confirmar que a
função usa a mesma tupla de conflito do índice unique (`flight_date, flight_num, dep_code, arr_code, pnr`).

Run: `grep -c "if not exists\|create or replace\|drop policy if exists" supabase/migrations/008_flights.sql`
Expected: `4` ou mais (2 índices + tabela + função + policy drop).

- [ ] **Step 4: Aplicar no Supabase (ação do usuário)**

Pausa para o usuário: aplicar `008_flights.sql` no SQL Editor do Supabase Dashboard
(projeto `jjmnczfrjnbqwfktevoh`) e confirmar "Success. No rows returned". Sem isso, as tarefas
seguintes não têm backend. (Se o usuário não puder aplicar agora, as próximas tarefas ainda
compilam; só não funcionam em runtime.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/008_flights.sql supabase/migrations/README.md
git commit -m "feat(vols): migration 008 — tabela flights + RLS + flights_upsert"
```

---

## Task 2: Módulo `vols.js` — página read-only (cache + load + render + wiring)

Cria o módulo, a UI (sidebar + seção), o import, e o wiring de seção. Ao fim, abrir "Vols
(Departures)" mostra a tabela hidratada do Supabase (vazia se a tabela estiver vazia). Sem CRUD
ainda (Task 3).

**Files:**
- Create: `src/js/vols.js`
- Modify: `index.html` (sidebar `snav-vols` após `snav-fornecedores`; bloco `section-vols` após `section-fornecedores` ou junto às demais seções)
- Modify: `src/js/main.js` (import)
- Modify: `src/js/app.js:9602` (`SECTION_IDS` += `'vols'`) e `src/js/app.js:9682-9695` (refresh no `sidebarGo`)

**Interfaces:**
- Consumes: `supabase`, `SUPABASE_ENABLED` de `./supabase-client.js`; RPC `flights_upsert` e tabela `flights` da Task 1.
- Produces (globais, consumidos por Tasks 3–7):
  - `window._volsRows` — array de objetos `{id, flight_date, flight_num, dep_code, dep_time, arr_code, arr_time, pnr, client, dossier_ref, source}` (cache do board, já filtrado `flight_date >= hoje`).
  - `window.volsLoad()` — `async`, recarrega o cache do Supabase e re-renderiza. Retorna Promise.
  - `window.volsRender()` — síncrona, renderiza `#vols-tbody` do cache.
  - `window._volsParseDate(v)` → `Date|null`; `window._volsHHMM(v)` → `'HH:MM'`; `window._volsSurname(full)` → `'NOM'`. (helpers reusados nas Tasks 3/5/6.)

- [ ] **Step 1: Criar `src/js/vols.js` (helpers + cache + load + render read-only)**

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// Vols (Departures) — quadro de partidas compartilhado (backend Supabase).
// Porte da feature do monolito.html. Cache em memória hidratado do Supabase e
// mantido vivo por Realtime (padrão de permissions.js). Render síncrono.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

// ── Cache do board (já filtrado flight_date >= hoje) ────────────────────────
let _volsRows = [];
let _volsEditIdx = -1;          // índice em edição inline (Task 3); -1 = nenhum
let _volsLoaded = false;
window._volsRows = _volsRows;

// ── Helpers de data/hora/nome (portados do monólito) ────────────────────────
const _MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function _pad2(n) { return ('0' + n).slice(-2); }

// Aceita 'YYYY-MM-DD', '17JUN26' e Date; constrói SEMPRE data local (evita o
// bug de UTC que rola um dia para trás em fuso negativo e poda "hoje").
function _parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) { const x = new Date(v.getTime()); x.setHours(0,0,0,0); return isNaN(x) ? null : x; }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})([A-Za-z]{3})(\d{2})$/);
  if (m) {
    const mi = _MON.indexOf(m[2].toUpperCase());
    if (mi < 0) return null;
    const x = new Date(2000 + parseInt(m[3], 10), mi, parseInt(m[1], 10)); x.setHours(0,0,0,0);
    return isNaN(x) ? null : x;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const x = new Date(parseInt(iso[1],10), parseInt(iso[2],10)-1, parseInt(iso[3],10)); x.setHours(0,0,0,0);
    return isNaN(x) ? null : x;
  }
  const d = new Date(s); if (isNaN(d.getTime())) return null; d.setHours(0,0,0,0); return d;
}
// Normaliza hora para 'HH:MM' (billets guardam datetime completo).
function _hhmm(v) {
  v = String(v == null ? '' : v).trim(); if (!v) return '';
  const m = v.match(/(\d{1,2}):(\d{2})/); if (!m) return '';
  return _pad2(m[1]) + ':' + m[2];
}
// Sobrenome (convenção de booking: "NOM PRENOM" → primeira palavra, maiúsculo).
function _surname(full) {
  full = String(full || '').trim(); if (!full) return '';
  return full.toUpperCase().split(/\s+/)[0];
}
// 'YYYY-MM-DD' → 'DD/MM/YYYY' para display.
function _fmtDate(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
}
function _esc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Data local de hoje como 'YYYY-MM-DD' (para o filtro >= hoje na query).
function _todayISO() {
  const d = new Date(); return d.getFullYear() + '-' + _pad2(d.getMonth()+1) + '-' + _pad2(d.getDate());
}
window._volsParseDate = _parseDate;
window._volsHHMM = _hhmm;
window._volsSurname = _surname;

// ── Load: hidrata o cache do Supabase (voos de hoje em diante) ──────────────
async function volsLoad() {
  if (!SUPABASE_ENABLED || !supabase) { _volsLoaded = true; volsRender(); return; }
  try {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      .gte('flight_date', _todayISO())
      .order('flight_date', { ascending: true })
      .order('dep_time', { ascending: true });
    if (error) { console.warn('[vols] load', error.message); }
    _volsRows = (data || []);
    window._volsRows = _volsRows;
    _volsLoaded = true;
  } catch (e) { console.warn('[vols] load', e); }
  volsRender();
  try { if (window.__enhanceDashboard) window.__enhanceDashboard(); } catch (e) {}   // widget converge (Task 7)
}
window.volsLoad = volsLoad;

// ── Render da tabela (síncrono, lê o cache) ─────────────────────────────────
function volsRender() {
  const tb = document.getElementById('vols-tbody');
  if (!tb) return;
  const cnt = document.getElementById('vols-count');
  if (cnt) cnt.textContent = _volsRows.length + (_volsRows.length === 1 ? ' vol' : ' vols');

  if (!_volsRows.length && _volsEditIdx < 0) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--navy-faint);padding:1.5rem;">Aucun vol enregistré.</td></tr>';
    return;
  }
  tb.innerHTML = _volsRows.map(function (r, i) {
    // linha de leitura (a de edição vem na Task 3)
    return '<tr data-vols-ref="' + _esc(r.dossier_ref || r.pnr || '') + '" style="cursor:pointer;">'
      + '<td>' + _esc(_fmtDate(r.flight_date)) + '</td>'
      + '<td style="font-weight:700;">' + _esc(r.flight_num || '—') + '</td>'
      + '<td>' + _esc(r.dep_code) + '</td>'
      + '<td>' + _esc(r.dep_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_code) + '</td>'
      + '<td>' + _esc(r.pnr || '—') + '</td>'
      + '<td>' + _esc(r.client || '—') + '</td>'
      + '<td style="text-align:center;white-space:nowrap;color:var(--navy-faint);">—</td>'
      + '</tr>';
  }).join('');
}
window.volsRender = volsRender;

// ── Bootstrap: carrega ao abrir a seção pela 1ª vez ─────────────────────────
window.__volsEnsureLoaded = function () {
  if (!_volsLoaded) { volsLoad(); } else { volsRender(); }
};
```

- [ ] **Step 2: Adicionar o item de sidebar no `index.html`**

In `index.html`, after line 143 (`snav-fornecedores`), insert a new sidebar button:

```html
    <button class="sidebar-item" id="snav-vols" onclick="sidebarGo('vols')">Vols (Departures)</button>
```

(Resultado: fica entre Fornecedores e Vendedores — a spec pede "entre Bookings e Fornecedores";
a plataforma não tem "Quotes" e já lista Bookings→Fornecedores→Vendedores. Colocar logo após
Fornecedores preserva a vizinhança lógica do monólito. Se o usuário preferir exatamente entre
Bookings e Fornecedores, mover para após a linha 142.)

- [ ] **Step 3: Adicionar o bloco `section-vols` no `index.html`**

In `index.html`, locate the block `<div class="section-page" id="section-fornecedores">` and insert
**before it** (ou junto às demais `section-page`) this block:

```html
<div class="section-page" id="section-vols">
  <div class="section-page-header" style="flex-direction:row;align-items:center;justify-content:space-between;padding-top:1rem;padding-bottom:1rem;">
    <div style="display:flex;align-items:center;gap:0.85rem;">
      <button class="sidebar-open-btn" onclick="sidebarOpen()" title="Ouvrir le menu" style="background:none;border:none;cursor:pointer;padding:0;flex-shrink:0;display:flex;align-items:center;opacity:0.88;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="26" width="26" fill="none" stroke="#06203b" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <div class="section-page-title">Vols &mdash; Departures</div>
    </div>
    <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;flex-shrink:0;">
      <span id="vols-count" style="font-size:0.78rem;color:var(--navy-soft);font-weight:600;white-space:nowrap;"></span>
      <button class="btn btn-sm" onclick="window._volsRowAdd&&window._volsRowAdd();" style="background:#e8f5e9;color:#15803d;border:1px solid #bbe5bf;" title="Ajouter un vol">+ Ajouter</button>
      <button class="btn btn-sm" onclick="window.volsLoad&&window.volsLoad();" style="background:#eef2f7;color:#06203b;border:1px solid var(--border);" title="Recharger depuis le serveur">&#8635; Rafra&icirc;chir</button>
      <button class="btn btn-sm" onclick="window._volsClearAll&&window._volsClearAll();" style="background:#fce8e8;color:#b91c1c;border:1px solid #f5c2c2;" title="Vider la liste partag&eacute;e">&#128465; Tout effacer</button>
    </div>
  </div>
  <div class="section-page-body">
    <div style="font-size:0.78rem;color:var(--navy-soft);margin-bottom:0.75rem;">Liste partag&eacute;e des d&eacute;parts. La suppression retire le vol pour tous les postes.</div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr>
          <th>Date</th><th>Vol</th><th>De</th><th>D&eacute;part</th><th>Arriv&eacute;e</th><th>&Agrave;</th><th>PNR</th><th>Client</th>
          <th style="width:70px;text-align:center;">Action</th>
        </tr></thead>
        <tbody id="vols-tbody"></tbody>
      </table>
    </div>
  </div>
</div>
```

(Os botões apontam para `window._volsRowAdd`/`_volsClearAll` que ainda não existem — criados na
Task 3. O guard `&&` evita erro no clique enquanto isso.)

- [ ] **Step 4: Importar `vols.js` no `main.js`**

In `src/js/main.js`, after the line `import './client-picker.js';` (linha 29), add:

```javascript
import './vols.js';
```

(Depende de `supabase-client.js` — já importado transitivamente pelos módulos de fase; `vols.js`
só usa `supabase`/`SUPABASE_ENABLED`, que são criados no import do próprio `supabase-client.js`.)

- [ ] **Step 5: Registrar a seção `vols` no `sidebarGo` (`app.js`)**

In `src/js/app.js:9602`, add `'vols'` ao array `SECTION_IDS`:

```javascript
var SECTION_IDS = ['welcome','quoting','bookings','fornecedores','vols','vendedores','programas','disponibilidades','tarefas','clientes','financeiro'];
```

In `src/js/app.js`, dentro do bloco de refresh do `sidebarGo` (após a linha
`if (section === 'fornecedores')     fornRender();`, ~9688), add:

```javascript
    if (section === 'vols')             { if (typeof window.__volsEnsureLoaded === 'function') window.__volsEnsureLoaded(); }
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build conclui sem erro (`✓ built in …`). Sem `Rollup failed`/`is not exported`.

- [ ] **Step 7: Verificação runtime (checagem manual)**

Run: `npm run dev` e abrir a app no browser. Fazer login, clicar em **"Vols (Departures)"** na
sidebar.
Expected: a seção abre; o cabeçalho mostra os botões (+ Ajouter / ↻ Rafraîchir / 🗑 Tout effacer);
a tabela mostra "Aucun vol enregistré." (tabela vazia) sem erro no console. Contagem "0 vols".

- [ ] **Step 8: Commit**

```bash
git add src/js/vols.js src/js/main.js src/js/app.js index.html
git commit -m "feat(vols): página Vols (Departures) read-only + wiring de sidebar/seção"
```

---

## Task 3: CRUD manual (add / editar / excluir / Tout effacer)

Edição inline de linha, gravando no Supabase. Realtime (Task 4) fará re-render entre postos; aqui,
após cada escrita, recarregamos o cache (`volsLoad`).

**Files:**
- Modify: `src/js/vols.js`

**Interfaces:**
- Consumes: `_volsRows`, `volsRender`, `volsLoad`, `_parseDate`, `_hhmm`, `supabase`, `SUPABASE_ENABLED`; helper de data `_ddmmmyy`-equivalente não é necessário (guardamos `flight_date` como ISO).
- Produces (globais, usados pelo `index.html` da Task 2):
  - `window._volsRowAdd()`, `window._volsRowEdit(i)`, `window._volsRowSave(i)`, `window._volsRowCancel()`, `window._volsRowDelete(i)`, `window._volsClearAll()`.

- [ ] **Step 1: Trocar `volsRender` para suportar a linha em edição**

In `src/js/vols.js`, replace the map body inside `volsRender` (o `return '<tr data-vols-ref…'`
da Task 2) para diferenciar a linha em edição. Substituir o corpo do `.map` por:

```javascript
  const inp = function (val, key) {
    return '<input data-fk="' + key + '" value="' + _esc(val) + '" '
      + 'style="width:100%;box-sizing:border-box;padding:3px 5px;font-size:0.72rem;border:1px solid var(--border);border-radius:4px;font-family:inherit;" />';
  };
  tb.innerHTML = _volsRows.map(function (r, i) {
    if (i === _volsEditIdx) {
      return '<tr data-edit="1" style="background:#fffbe6;">'
        + '<td>' + inp(r.flight_date, 'flight_date') + '</td>'
        + '<td>' + inp(r.flight_num, 'flight_num') + '</td>'
        + '<td>' + inp(r.dep_code, 'dep_code') + '</td>'
        + '<td>' + inp(r.dep_time, 'dep_time') + '</td>'
        + '<td>' + inp(r.arr_time, 'arr_time') + '</td>'
        + '<td>' + inp(r.arr_code, 'arr_code') + '</td>'
        + '<td>' + inp(r.pnr, 'pnr') + '</td>'
        + '<td>' + inp(r.client, 'client') + '</td>'
        + '<td style="text-align:center;white-space:nowrap;">'
        +   '<button title="Enregistrer" onclick="window._volsRowSave(' + i + ')" style="background:none;border:none;cursor:pointer;color:#15803d;font-size:1rem;line-height:1;margin-right:5px;">✓</button>'
        +   '<button title="Annuler" onclick="window._volsRowCancel()" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:1rem;line-height:1;">✕</button>'
        + '</td>'
        + '</tr>';
    }
    return '<tr data-vols-ref="' + _esc(r.dossier_ref || r.pnr || '') + '" style="cursor:pointer;">'
      + '<td>' + _esc(_fmtDate(r.flight_date)) + '</td>'
      + '<td style="font-weight:700;">' + _esc(r.flight_num || '—') + '</td>'
      + '<td>' + _esc(r.dep_code) + '</td>'
      + '<td>' + _esc(r.dep_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_time || '—') + '</td>'
      + '<td>' + _esc(r.arr_code) + '</td>'
      + '<td>' + _esc(r.pnr || '—') + '</td>'
      + '<td>' + _esc(r.client || '—') + '</td>'
      + '<td style="text-align:center;white-space:nowrap;">'
      +   '<button title="Modifier" onclick="event.stopPropagation();window._volsRowEdit(' + i + ')" style="background:none;border:none;cursor:pointer;color:#06203b;font-size:0.9rem;line-height:1;margin-right:5px;">✎</button>'
      +   '<button title="Supprimer" onclick="event.stopPropagation();window._volsRowDelete(' + i + ')" style="background:none;border:none;cursor:pointer;color:#b91c1c;font-size:0.95rem;line-height:1;">✕</button>'
      + '</td>'
      + '</tr>';
  }).join('');
```

Also remove the early-return-only "read-only" branch from Task 2 if it duplicates (garantir que só
existe UM `tb.innerHTML = _volsRows.map(...)`). O bloco "Aucun vol enregistré." permanece antes do map.

- [ ] **Step 2: Adicionar as funções de CRUD ao final de `vols.js`**

```javascript
// ── CRUD manual (grava no Supabase; recarrega o cache após cada escrita) ────
function _collectEditRow() {
  const tr = document.querySelector('#vols-tbody tr[data-edit="1"]');
  if (!tr) return null;
  const o = {};
  Array.prototype.forEach.call(tr.querySelectorAll('input[data-fk]'), function (el) {
    o[el.getAttribute('data-fk')] = el.value;
  });
  return o;
}

window._volsRowAdd = function () {
  if (_volsEditIdx >= 0) { alert('Terminez la ligne en cours d’édition d’abord.'); return; }
  _volsRows.unshift({ id: null, flight_date: '', flight_num: '', dep_code: '', dep_time: '', arr_code: '', arr_time: '', pnr: '', client: '', dossier_ref: '', source: 'manual', _isNew: true });
  _volsEditIdx = 0;
  volsRender();
  try { const f = document.querySelector('#vols-tbody tr[data-edit="1"] input[data-fk="flight_date"]'); if (f) f.focus(); } catch (e) {}
};

window._volsRowEdit = function (i) {
  if (_volsEditIdx >= 0 && _volsRows[_volsEditIdx] && _volsRows[_volsEditIdx]._isNew) {
    _volsRows.splice(_volsEditIdx, 1);         // descarta um add em branco abandonado
    if (i > _volsEditIdx) i--;
  }
  _volsEditIdx = i;
  volsRender();
};

window._volsRowCancel = function () {
  if (_volsEditIdx >= 0 && _volsRows[_volsEditIdx] && _volsRows[_volsEditIdx]._isNew) {
    _volsRows.splice(_volsEditIdx, 1);         // remove a linha em branco que adicionamos
  }
  _volsEditIdx = -1;
  volsRender();
};

window._volsRowSave = async function (i) {
  const o = _collectEditRow();
  if (!o) return;
  const d = _parseDate(o.flight_date);
  const rec = {
    flight_date: d ? (d.getFullYear() + '-' + _pad2(d.getMonth()+1) + '-' + _pad2(d.getDate())) : '',
    flight_num: String(o.flight_num || '').trim(),
    dep_code: String(o.dep_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3),
    dep_time: _hhmm(o.dep_time),
    arr_time: _hhmm(o.arr_time),
    arr_code: String(o.arr_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3),
    pnr: String(o.pnr || '').trim(),
    client: String(o.client || '').trim(),
  };
  if (!rec.flight_date || !rec.dep_code || !rec.arr_code) {
    alert('Date, De (DEP) et À (ARR) sont obligatoires.'); return;
  }
  const existing = _volsRows[i];
  _volsEditIdx = -1;
  if (!SUPABASE_ENABLED || !supabase) { volsRender(); return; }
  try {
    if (existing && existing.id) {
      const { error } = await supabase.from('flights').update(rec).eq('id', existing.id);
      if (error) console.warn('[vols] update', error.message);
    } else {
      const { error } = await supabase.from('flights').insert(Object.assign({ dossier_ref: '', source: 'manual' }, rec));
      if (error) console.warn('[vols] insert', error.message);
    }
  } catch (e) { console.warn('[vols] save', e); }
  await volsLoad();
};

window._volsRowDelete = async function (i) {
  const r = _volsRows[i];
  if (!r) return;
  if (!window.confirm('Supprimer ce vol ?\n' + (_fmtDate(r.flight_date) || '') + '  ' + (r.flight_num || '') + '  ' + (r.dep_code || '') + '→' + (r.arr_code || ''))) return;
  if (_volsEditIdx === i) _volsEditIdx = -1;
  if (r.id && SUPABASE_ENABLED && supabase) {
    try { const { error } = await supabase.from('flights').delete().eq('id', r.id); if (error) console.warn('[vols] delete', error.message); }
    catch (e) { console.warn('[vols] delete', e); }
  }
  await volsLoad();
};

window._volsClearAll = async function () {
  if (!window.confirm('Vider toute la liste des départs ? (action partagée sur tous les postes)')) return;
  if (SUPABASE_ENABLED && supabase) {
    // apaga tudo: delete com filtro sempre-verdadeiro (flight_date não nulo)
    try { const { error } = await supabase.from('flights').delete().not('flight_date', 'is', null); if (error) console.warn('[vols] clear', error.message); }
    catch (e) { console.warn('[vols] clear', e); }
  }
  _volsEditIdx = -1;
  await volsLoad();
};
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 4: Verificação runtime (add/editar/excluir)**

`npm run dev` → Vols. Requer a migration 008 aplicada (Task 1 Step 4).
- Clicar **+ Ajouter**, preencher Date (`2026-08-10`), De (`GRU`), À (`CDG`), PNR (`ABCDEF`),
  Client (`SILVA`), salvar (✓). Expected: linha persiste; contagem "1 vol".
- Recarregar a página, abrir Vols. Expected: a linha continua lá (veio do Supabase).
- Editar (✎) → mudar Client → salvar. Expected: valor atualizado após reload.
- Excluir (✕) → confirmar. Expected: linha some; "0 vols".

- [ ] **Step 5: Commit**

```bash
git add src/js/vols.js
git commit -m "feat(vols): CRUD manual (add/editar/excluir/tout effacer) no Supabase"
```

---

## Task 4: Realtime + clique no dossier

Subscription no canal `flights` (re-render ao vivo entre postos) e clique na linha abrindo o deal.

**Files:**
- Modify: `src/js/vols.js`

**Interfaces:**
- Consumes: `supabase`, `SUPABASE_ENABLED`, `volsLoad`; padrão de `permissions.js:246-266`.
- Produces: subscription no canal `'vols-flights'`; delegated click em `#vols-tbody [data-vols-ref]`.

- [ ] **Step 1: Adicionar subscription Realtime ao final de `vols.js`**

```javascript
// ── Realtime: qualquer insert/update/delete recarrega o board ao vivo ───────
function _volsSubscribeRealtime() {
  if (!SUPABASE_ENABLED || !supabase || _volsSubscribeRealtime.__done) return;
  _volsSubscribeRealtime.__done = true;
  try {
    supabase.channel('vols-flights')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, function () {
        // não recarregar no meio de uma edição inline (a linha em progresso sumiria)
        if (_volsEditIdx >= 0) return;
        volsLoad();
      })
      .subscribe();
  } catch (e) { console.warn('[vols] realtime', e); }
}
_volsSubscribeRealtime();
```

- [ ] **Step 2: Adicionar clique na linha → abrir o deal (delegated, uma vez)**

```javascript
// ── Clique numa linha → abre o dossier correspondente (por ref; fallback PNR) ─
(function _volsDelegateRowClick() {
  document.addEventListener('click', function (e) {
    const tr = e.target.closest ? e.target.closest('#vols-tbody tr[data-vols-ref]') : null;
    if (!tr) return;
    if (tr.getAttribute('data-edit') === '1') return;    // linha em edição não navega
    const ref = tr.getAttribute('data-vols-ref');
    if (!ref) return;
    // resolve ref → dossierId varrendo a lista local (padrão de app.js:33042)
    let list = [];
    try { list = JSON.parse(localStorage.getItem('expatur_dossier_list') || '[]'); } catch (ex) {}
    let targetId = null;
    for (let i = 0; i < list.length; i++) {
      let dd = null;
      try { dd = JSON.parse(localStorage.getItem('expatur_dossier_' + list[i].id) || 'null'); } catch (ex) {}
      const dRef = (dd && dd.fields && dd.fields['booking-ref']) || list[i].label || '';
      if (dRef === ref) { targetId = list[i].id; break; }
    }
    if (targetId && typeof window.switchDossier === 'function') window.switchDossier(targetId);
    if (typeof window.sidebarGo === 'function') window.sidebarGo('index');
  });
})();
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 4: Verificação runtime (Realtime + clique)**

Requer Realtime habilitado para a tabela `flights` no Supabase (Dashboard → Database →
Replication → publication `supabase_realtime` → incluir `flights`). Se não estiver, o board ainda
funciona via **Rafraîchir**.
- Abrir a app em **duas abas** logadas. Na aba A, adicionar um voo. Expected: aparece na aba B em
  segundos, sem refresh manual.
- Clicar numa linha cujo PNR/ref bate um dossier existente. Expected: navega para o dossier
  (Ticketing/index).

- [ ] **Step 5: Commit**

```bash
git add src/js/vols.js
git commit -m "feat(vols): Realtime entre postos + clique na linha abre o dossier"
```

---

## Task 5: Captura na emissão (source='emit')

Ao Emitir, expandir o billet ativo em linhas de segmento e fazer upsert (`flights_upsert`).

**Files:**
- Modify: `src/js/vols.js`

**Interfaces:**
- Consumes: `supabase`, `SUPABASE_ENABLED`, `_parseDate`, `_hhmm`, `_surname`, `volsLoad`;
  shape do billet `expatur_billet_<ref>` (`legs[].segments[]`, `masterPnr`, `isMC`, `pax[]`),
  confirmado em `app.js`/`dashboard.js`.
- Produces: `window._volsRowsFromBillet(billet, ref, surname)` → array de linhas ISO; wrap de
  `window.emettreBillet`; `window._volsCaptureActive()`.

- [ ] **Step 1: Adicionar o expansor de billet e a captura ao final de `vols.js`**

```javascript
// ── Emissão → linhas de segmento (porta de _flightRowsFromBillet) ───────────
// Cada leg pode ser conexão (segments[]) → 1 linha por segmento. Datas em ISO.
function _rowsFromBillet(billet, ref, surname) {
  const rows = [];
  if (!billet || !billet.legs || !billet.legs.length) return rows;
  const master = billet.masterPnr || '';
  billet.legs.forEach(function (leg) {
    const legDate = leg.date || leg.depDate || leg.departureDate || '';
    const legPnr = (billet.isMC && leg.pnr) ? leg.pnr : (master || leg.pnr || ref || '');
    const segs = (leg.segments && leg.segments.length) ? leg.segments : null;
    const _iso = function (d) { return d.getFullYear() + '-' + _pad2(d.getMonth()+1) + '-' + _pad2(d.getDate()); };
    if (segs) {
      segs.forEach(function (s) {
        const d = _parseDate(s.depDate || s.date || legDate); if (!d) return;
        rows.push({
          flight_date: _iso(d), flight_num: String(s.fn || '').trim(),
          dep_code: String(s.depCode || s.dep || '').toUpperCase().slice(0, 3), dep_time: _hhmm(s.depTime),
          arr_time: _hhmm(s.arrTime), arr_code: String(s.arrCode || s.arr || '').toUpperCase().slice(0, 3),
          pnr: legPnr, client: surname, dossier_ref: ref, source: 'emit',
        });
      });
    } else {
      const d = _parseDate(legDate); if (!d) return;
      let fn = leg.fn || leg.flightNumber || '';
      if (!fn && leg.airlineCodes && leg.airlineCodes.length) fn = leg.airlineCodes.join('/');
      rows.push({
        flight_date: _iso(d), flight_num: String(fn || '').trim(),
        dep_code: String(leg.dep || leg.depCode || '').toUpperCase().slice(0, 3), dep_time: _hhmm(leg.depTime),
        arr_time: _hhmm(leg.arrTime), arr_code: String(leg.arr || leg.arrCode || '').toUpperCase().slice(0, 3),
        pnr: legPnr, client: surname, dossier_ref: ref, source: 'emit',
      });
    }
  });
  return rows;
}
window._volsRowsFromBillet = _rowsFromBillet;

// Lê o billet do dossier ativo e faz upsert das linhas (merge server-side).
async function _volsCaptureActive() {
  if (!SUPABASE_ENABLED || !supabase) return;
  let ref = '';
  const refEl = document.getElementById('booking-ref');
  if (refEl && refEl.value) ref = refEl.value.trim();
  if (!ref) {
    try {
      const aid = localStorage.getItem('expatur_active_dossier');
      const dd = aid ? JSON.parse(localStorage.getItem('expatur_dossier_' + aid) || 'null') : null;
      if (dd && dd.fields) ref = (dd.fields['booking-ref'] || '').trim();
    } catch (e) {}
  }
  if (!ref) { console.warn('[vols] sem booking-ref na emissão'); return; }

  let billet = null;
  try { billet = JSON.parse(localStorage.getItem('expatur_billet_' + ref.replace(/[^a-zA-Z0-9]/g, '_')) || 'null'); } catch (e) {}
  if (!billet || !billet.legs || !billet.legs.length) {
    try {
      const aid2 = localStorage.getItem('expatur_active_dossier');
      const dd2 = aid2 ? JSON.parse(localStorage.getItem('expatur_dossier_' + aid2) || 'null') : null;
      if (dd2 && dd2.savedBilletData) billet = dd2.savedBilletData;
    } catch (e) {}
  }
  if (!billet || !billet.legs || !billet.legs.length) { console.warn('[vols] sem legs no billet', ref); return; }

  let surname = '';
  if (billet.pax && billet.pax[0]) surname = _surname(billet.pax[0].nom || billet.pax[0].prenom || '');
  if (!surname) { try { surname = _surname((document.getElementById('pax-name-1') || {}).value || ''); } catch (e) {} }

  const rows = _rowsFromBillet(billet, ref, surname);
  if (!rows.length) { console.warn('[vols] billet sem linhas', ref); return; }
  try {
    const { error } = await supabase.rpc('flights_upsert', { rows });
    if (error) { console.warn('[vols] upsert emit', error.message); return; }
    console.info('[vols] ' + rows.length + ' segmento(s) capturado(s) para ' + ref);
    volsLoad();
  } catch (e) { console.warn('[vols] capture', e); }
}
window._volsCaptureActive = _volsCaptureActive;

// Trigger: envolve emettreBillet (roda após a cadeia de emissão salvar o billet).
(function _volsHookEmit() {
  if (window._volsEmitHooked) return;
  const prev = window.emettreBillet;
  if (typeof prev !== 'function') { setTimeout(_volsHookEmit, 500); return; }
  window.emettreBillet = function () {
    const r = prev.apply(this, arguments);
    setTimeout(function () { try { _volsCaptureActive(); } catch (e) { console.warn('[vols] capture', e); } }, 120);
    return r;
  };
  window._volsEmitHooked = true;
})();
```

(Nota de convergência: `deal-status.js:335` já envolve `emettreBillet`. Como `vols.js` é importado
DEPOIS em `main.js`, este wrap fica por fora — chama `prev()` (a versão do deal-status) e depois
captura. O `setTimeout(…,120)` garante que o billet já foi persistido em `expatur_billet_<ref>`
antes de lermos. O dedupe da `flights_upsert` torna re-emissões idempotentes.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 3: Verificação runtime (emissão single / return / multi-city)**

Requer migration 008 aplicada. Criar um dossier, montar itinerário no Ticketing, **Emitir**.
- **Single:** 1 trecho → 1 linha em Vols, com Date/De/À/PNR/Client corretos.
- **Return:** 2 linhas (ida + volta).
- **Multi-city / conexão:** 1 linha por segmento.
- **Re-emitir** o mesmo billet. Expected: **sem duplicatas** (dedupe da `flights_upsert`);
  campos vazios podem ser enriquecidos, valores bons não mudam.

- [ ] **Step 4: Commit**

```bash
git add src/js/vols.js
git commit -m "feat(vols): captura automática dos segmentos na emissão (source=emit)"
```

---

## Task 6: Seed único das reservas existentes

Na 1ª carga com a tabela `flights` vazia, semear das reservas/billets já emitidos no localStorage.

**Files:**
- Modify: `src/js/vols.js`

**Interfaces:**
- Consumes: `supabase`, `SUPABASE_ENABLED`, `_parseDate`, `_hhmm`, `_surname`, `_rowsFromBillet`,
  `volsLoad`; localStorage (`expatur_dossier_list`, `expatur_dossier_<id>`, `expatur_billet_<ref>`,
  `billetFrozen_<ref>`, `expatur_booked*`).
- Produces: `window._volsSeedIfEmpty()` — chamada dentro de `volsLoad` na 1ª carga vazia.

- [ ] **Step 1: Adicionar o coletor de seed e o gatilho ao final de `vols.js`**

```javascript
// ── Seed único: coleta voos das reservas EMITIDAS do localStorage ───────────
// Porta de _collectAllFlights104: só dossiers emitidos/booked (não devis puros).
function _collectSeedRows() {
  const out = [];
  let list = [];
  try { list = JSON.parse(localStorage.getItem('expatur_dossier_list') || '[]'); } catch (e) {}

  function _one(k) { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } }
  function _has(k) { try { return !!localStorage.getItem(k); } catch (e) { return false; } }
  function _isIssued(id, dossier, ref) {
    const sref = ref ? String(ref).replace(/[^a-zA-Z0-9]/g, '_') : '';
    if (_one('expatur_booked_' + id)) return true;
    if (ref && (_one('expatur_booked_' + ref) || _one('expatur_booked_' + sref))) return true;
    if (ref && (_one('billetFrozen_' + ref) || _one('billetFrozen_' + sref))) return true;
    if (ref && (_has('expatur_bookedAt_' + ref) || _has('expatur_bookedAt_' + sref))) return true;
    if (dossier && dossier.status === 'issued') return true;
    return false;
  }

  list.forEach(function (item) {
    const id = item.id;
    const ref = item.label || id;
    let dossier = null;
    try { dossier = JSON.parse(localStorage.getItem('expatur_dossier_' + id) || 'null'); } catch (e) { return; }
    if (!dossier) return;
    const fields = dossier.fields || {};
    const dRef = fields['booking-ref'] || ref;
    if (!_isIssued(id, dossier, dRef)) return;

    let billet = null;
    try { billet = JSON.parse(localStorage.getItem('expatur_billet_' + String(dRef).replace(/[^a-zA-Z0-9]/g, '_')) || 'null'); } catch (e) {}
    if ((!billet || !billet.legs || !billet.legs.length) && dossier.savedBilletData) billet = dossier.savedBilletData;

    let surname = '';
    if (billet && billet.pax && billet.pax[0]) surname = _surname(billet.pax[0].nom || billet.pax[0].prenom || '');
    if (!surname) surname = _surname(fields['pax-name-1'] || ((fields['cli-prenom'] || '') + ' ' + (fields['cli-nom'] || '')).trim() || dRef);

    if (billet && billet.legs && billet.legs.length) {
      _rowsFromBillet(billet, dRef, surname).forEach(function (r) { r.source = 'seed'; out.push(r); });
    }
    // (dossiers booked sem billet salvo: sem itinerário confiável de segmentos → pulados no seed)
  });
  return out;
}

// Semeia só se a tabela estiver vazia (guardado por count=0). Uma vez.
async function _volsSeedIfEmpty() {
  if (!SUPABASE_ENABLED || !supabase || _volsSeedIfEmpty.__done) return;
  _volsSeedIfEmpty.__done = true;
  try {
    const { count, error } = await supabase.from('flights').select('id', { count: 'exact', head: true });
    if (error) { console.warn('[vols] seed count', error.message); return; }
    if ((count || 0) > 0) return;                         // já tem dados → não semeia
    const rows = _collectSeedRows();
    if (!rows.length) return;                             // nunca escrever seed vazio
    const { error: upErr } = await supabase.rpc('flights_upsert', { rows });
    if (upErr) { console.warn('[vols] seed upsert', upErr.message); return; }
    console.info('[vols] seed: ' + rows.length + ' linha(s) das reservas existentes.');
  } catch (e) { console.warn('[vols] seed', e); }
}
```

- [ ] **Step 2: Chamar o seed dentro de `volsLoad` (na 1ª carga)**

In `src/js/vols.js`, no início de `volsLoad`, antes do `select`, adicionar o gatilho de seed (roda
uma vez; se semear, o `select` seguinte já pega as linhas):

```javascript
async function volsLoad() {
  if (!SUPABASE_ENABLED || !supabase) { _volsLoaded = true; volsRender(); return; }
  try { await _volsSeedIfEmpty(); } catch (e) {}
  try {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      .gte('flight_date', _todayISO())
      .order('flight_date', { ascending: true })
      .order('dep_time', { ascending: true });
    // … (resto inalterado)
```

(Substituir a definição de `volsLoad` da Task 2 por esta, que adiciona a linha
`await _volsSeedIfEmpty();`. O `_volsSeedIfEmpty.__done` garante uma execução por sessão mesmo com
múltiplos `volsLoad`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 4: Verificação runtime (seed)**

Requer migration 008 aplicada e a tabela `flights` **vazia** (usar Tout effacer antes). Ter ao
menos um dossier emitido no localStorage.
- Recarregar a app e abrir Vols (ou o dashboard). Expected: as linhas das reservas emitidas
  aparecem (source=seed). Console: "[vols] seed: N linha(s)…".
- Recarregar de novo. Expected: **não duplica** e **não re-semeia** (count>0 barra; e o dedupe
  cobriria mesmo se rodasse).

- [ ] **Step 5: Commit**

```bash
git add src/js/vols.js
git commit -m "feat(vols): seed único do quadro a partir das reservas emitidas existentes"
```

---

## Task 7: Convergência do widget "Vols de la semaine" (dashboard)

O widget passa a ler do cache `_volsRows` (fonte única com o board), semana corrente lun→dim.

**Files:**
- Modify: `src/js/dashboard.js` (`_renderFlights`)

**Interfaces:**
- Consumes: `window._volsRows` (cache de `vols.js`), `window._volsParseDate`.
- Produces: `_renderFlights` renderiza do cache quando disponível; fallback à derivação atual
  (evita corrida de init quando `vols.js` ainda não carregou).

- [ ] **Step 1: Fazer `_renderFlights` preferir o cache de `vols.js`**

In `src/js/dashboard.js`, no início de `_renderFlights` (após `if (!host) return;`, ~linha 160),
inserir o ramo que usa o board como fonte única:

```javascript
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
```

(O restante de `_renderFlights` — a derivação por `_allDossiers()` — fica como está, servindo de
fallback até `vols.js` popular `window._volsRows`. Quando `volsLoad` termina, ele já chama
`window.__enhanceDashboard()` (Task 2), que re-renderiza o widget agora pelo board.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build verde.

- [ ] **Step 3: Verificação runtime (widget converge)**

Requer migration 008 aplicada e ao menos um voo no board (via emissão, seed ou add manual) dentro
da semana corrente.
- Abrir o **Accueil** (dashboard). Expected: o widget "Vols de la semaine" mostra os voos do board
  (mesmos que aparecem em Vols), agrupados Hier/Aujourd'hui/Demain/Prochains.
- Adicionar um voo em Vols para hoje → voltar ao dashboard (ou aguardar Realtime). Expected: o
  widget reflete o novo voo.
- Clicar num card do widget. Expected: abre o dossier (handler `[data-dossier-ref]` de
  `app.js:33033` já cobre `#welcome-flights-week`).

- [ ] **Step 4: Commit**

```bash
git add src/js/dashboard.js
git commit -m "feat(vols): widget 'Vols de la semaine' converge para o board (fonte única)"
```

---

## Self-Review

**1. Cobertura da spec:**
- §3 Modelo de dados → Task 1 (tabela/RLS/unique/índice/enriquecimento via `flights_upsert`). ✓
- §4.1 Ao Emitir → Task 5. §4.2 Manual → Task 3. §4.3 Seed → Task 6. ✓
- §5 UI (sidebar + section-vols + tabela + clique no dossier) → Task 2 + Task 4 (clique). ✓
- §6 Convergência do widget → Task 7. ✓
- §7 Realtime → Task 4. ✓
- §8 Arquivos/integração → todas as tasks; ordem de import resolvida (Task 2 Step 4). ✓
- §9 Critérios de teste → cobertos nas verificações runtime das Tasks 3/5/6/7. ✓
- §10 Pontos a verificar: migration=008 ✓; shape do billet confirmado ✓; ordem de import ✓.
- §11 Fora de escopo (poda física, `access_vols`, Worker) → respeitado (leitura filtra por data;
  RLS aberta; sem Worker). ✓

**2. Placeholders:** nenhum "TODO/TBD/similar to Task N"; todo passo de código traz o código real.

**3. Consistência de tipos/nomes:** `_volsRows` (objetos com colunas snake_case do Supabase) é o
contrato único entre Tasks 2–7. Helpers `_volsParseDate/_volsHHMM/_volsSurname` expostos na Task 2
e reusados nas Tasks 5/6. `flights_upsert(rows jsonb)` (Task 1) chamado nas Tasks 5/6 com o mesmo
shape de linha produzido por `_rowsFromBillet`/`_collectSeedRows`. Globais de CRUD
(`_volsRowAdd/Edit/Save/Cancel/Delete/_volsClearAll`) casam os `onclick` do HTML da Task 2.

## Handoff de execução

**Plano completo e salvo em `docs/superpowers/plans/2026-07-03-vols-departures.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendado)** — despacho um subagente novo por tarefa, reviso entre tarefas, iteração rápida.

**2. Execução Inline** — executo as tarefas nesta sessão com executing-plans, em lote com checkpoints de revisão.

**Qual abordagem?**
