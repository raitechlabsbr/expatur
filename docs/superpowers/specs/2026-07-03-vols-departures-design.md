# Design — Feature Vols (Departures)

> Porte da feature "Vols — Departures" do `monolito.html` (produção) para a plataforma
> refatorada, no backend Supabase. Parte do trabalho de convergência
> (ver [../../AUDITORIA_CONVERGENCIA.md](../../AUDITORIA_CONVERGENCIA.md)).
> Branch: `feature/backoffice-specs` · Data: 2026-07-03.

## 1. Contexto e objetivo

O monólito de produção tem um menu **Vols (Departures)** — um *quadro de partidas
compartilhado* entre todos os postos, listando os próximos voos emitidos. A plataforma
refatorada não tem esse menu (gap confirmado na auditoria). Objetivo: reproduzir a feature
na plataforma, preservando a UX/UI, mas no backend Supabase (não no Worker Cloudflare que a
produção usa).

No monólito o quadro é alimentado por um CSV (`expatur_flight_data_csv`) espelhado num
Cloudflare Worker + KV. Consumidores: a página Vols **e** o widget "Vols de la semaine" do
dashboard, que leem da mesma fonte.

## 2. Decisões (validadas com o usuário)

1. **População:** auto (ao Emitir) + manual (add/editar/excluir) + seed único das reservas
   existentes — fidelidade à produção.
2. **Dashboard:** o widget "Vols de la semaine" **converge** para ler do novo quadro (fonte única).
3. **Permissões:** **compartilhado total** — qualquer usuário autenticado vê e edita/limpa
   o quadro (fiel à produção).
4. **Backend:** **Supabase** (tabela + RLS + Realtime), consistente com as 10 fases (entra no
   backup cifrado e no modelo de auth), em vez de reaproveitar o Worker Cloudflare.

## 3. Modelo de dados

Tabela `public.flights` — **uma linha por segmento de voo**:

| coluna | tipo | notas |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `flight_date` | date not null | data de partida do segmento |
| `flight_num` | text | nº do voo (ex.: "AT 205"); pode ser vazio |
| `dep_code` | text | IATA origem (3 letras, maiúsculo) |
| `dep_time` | text | hora de partida "HH:MM" |
| `arr_code` | text | IATA destino |
| `arr_time` | text | hora de chegada "HH:MM" |
| `pnr` | text | PNR (master; em multi-city, o do trecho quando houver) |
| `client` | text | sobrenome do PAX |
| `dossier_ref` | text | booking-ref de origem, para abrir o dossier ao clicar |
| `source` | text | `emit` \| `manual` \| `seed` |
| `created_by` | uuid | auth.uid() na criação |
| `created_at` | timestamptz default now() | |

- **Dedupe:** `unique (flight_date, flight_num, dep_code, arr_code, pnr)` — replica o
  merge/dedupe server-side do Worker. Upsert **on conflict**: mantém a linha existente e
  preenche `client`/`dossier_ref`/`arr_time`/`dep_time` **apenas se estiverem vazios** na linha
  existente (uma emissão mais completa enriquece a linha; nunca sobrescreve dado bom com vazio).
- **Índice:** `(flight_date)` para a query do board e do widget da semana.
- **RLS:** habilitada; policy única para `authenticated`: `select/insert/update/delete` a todos
  (decisão 3 — compartilhado total). Sem restrição por dono.
- **Poda:** não há delete físico automático; a **leitura** filtra `flight_date >= current_date`
  (voos passados não aparecem), igual à produção. (Limpeza física opcional fica fora de escopo.)

Migration: `supabase/migrations/0NN_flights.sql` (numeração após a última aplicada;
idempotente com `if not exists` / `on conflict`).

## 4. População

### 4.1 Ao Emitir (automático)
No momento da emissão, o `deal-status.js` já observa `billetFrozen_*`. A captura do Vols
engancha nesse mesmo ponto: lê `expatur_billet_<ref>`, expande os segmentos (porta de
`_flightRowsFromBillet` do monólito — trata `billet.legs[].segments[]`, `masterPnr`, `isMC`,
datas por trecho) e faz upsert das linhas na tabela `flights` (`source='emit'`).

### 4.2 Manual
Na página Vols: botão **+ Ajouter** (linha nova editável), edição inline e exclusão por linha,
todos gravando no Supabase (`source='manual'`). **Tout effacer** apaga o quadro para todos.

### 4.3 Seed único
Na 1ª carga com a tabela `flights` vazia, semear a partir das reservas/billets existentes
(porta de `_collectAllFlights104`). Guardado por um flag para não re-semear (ex.: só semeia se
`select count(*) from flights = 0`). Marca `source='seed'`.

## 5. UI (preservar UX/UI)

- **Sidebar:** novo item **"Vols (Departures)"** (`snav-vols` → `sidebarGo('vols')`), entre
  **Bookings** e **Fornecedores** — mesma posição e rótulo do monólito.
- **Seção:** reusar o HTML de `section-vols` do monólito: cabeçalho com contagem + botões
  **+ Ajouter / ↻ Rafraîchir / 🗑 Tout effacer**, e a tabela
  `Date · Vol · De · Départ · Arrivée · À · PNR · Client · Action`.
- **Clique no dossier/PNR:** abre o deal correspondente (resolve por `dossier_ref`; fallback por PNR).
- Estilo herdado do design system atual (classes `db-table`, `btn`, `section-page`).

## 6. Convergência do widget do dashboard

`_renderVolsSemaine104` (hoje deriva das reservas) passa a ler da tabela `flights` — voos da
**semana corrente** (lun→dim), agrupados como o widget já faz. Fonte única com o quadro Vols.
Mantém o layout atual do widget (só troca a fonte de dados).

## 7. Realtime

Subscription no canal Supabase da tabela `flights` (mesmo padrão do canal `profiles` da fase 6):
qualquer insert/update/delete re-renderiza o quadro (e o widget, se visível) ao vivo entre
postos. O botão **Rafraîchir** continua como fallback (recarrega do servidor).

## 8. Arquivos e integração

- `supabase/migrations/0NN_flights.sql` — tabela + RLS + unique + índice.
- `src/js/vols.js` — módulo: render/CRUD da tabela, sync Supabase, realtime, seed, hook de
  captura na emissão, e a leitura do widget da semana. Exporta `window.sidebarGo('vols')` handler
  e `window._volsRender`.
- `index.html` — item da sidebar + `section-vols`.
- `src/js/main.js` — importar `vols.js` na ordem correta.
- Convergência do widget: em `vols.js` (sobrepõe/alimenta `_renderVolsSemaine104` de `dashboard.js`)
  ou ajuste em `dashboard.js` — decidir no plano para evitar corrida de inicialização.

## 9. Critérios de teste

1. Emitir um billet (single, return e multi-city) → os segmentos aparecem no quadro Vols e no
   widget da semana, sem duplicatas ao re-emitir.
2. Add/editar/excluir manual persiste no Supabase e some/aparece em outro posto (Realtime).
3. Tout effacer limpa para todos.
4. Voos com data passada não aparecem; voos da semana aparecem no widget.
5. Clique no PNR/dossier abre o deal certo.
6. 1ª carga com tabela vazia semeia das reservas existentes; recargas não duplicam.
7. Build `npm run build` verde.

## 10. Pontos a verificar na implementação

- **Shape do billet** na plataforma (`expatur_billet_<ref>`): confirmar que `legs[].segments[]`,
  `masterPnr`, `isMC` e as datas por trecho batem com o que `_flightRowsFromBillet` espera
  (mesma linhagem, mas validar antes de portar o expansor).
- **Número da migration:** conferir a última aplicada em `supabase/migrations/`.
- **Ordem de import** em `main.js` (Vols depende de `supabase-client.js` e do storage).

## 11. Fora de escopo

- Limpeza física periódica de voos passados (a leitura já filtra).
- Permissão de módulo `access_vols` (decisão foi compartilhado total; se mudar, é um add-on da fase 6).
- Aposentar o Worker Cloudflare `ds=vols` (a plataforma não o usa; sem ação).
