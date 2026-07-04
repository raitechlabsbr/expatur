-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002 — Status canônico do deal, timeline e comments
-- (spec 1.x, A3, A9.1-9.2). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Colunas canônicas em dossiers (status/atribuição também vivem no jsonb,
--    mas as colunas permitem queries, RLS e relatórios) ────────────────────────
alter table public.dossiers add column if not exists status      text default 'quote'
  check (status in ('quote','awaiting_payment','ticketing','ticketed'));
alter table public.dossiers add column if not exists created_by  uuid references auth.users(id);
alter table public.dossiers add column if not exists assigned_to uuid references auth.users(id);

create index if not exists dossiers_status      on public.dossiers(status);
create index if not exists dossiers_assigned_to on public.dossiers(assigned_to);

-- ── Timeline de transições de status (A3.1) — imutável ───────────────────────
create table if not exists public.deal_timeline (
  id          bigserial primary key,
  dossier_id  text not null,
  from_status text,
  to_status   text not null,
  user_email  text,
  user_id     uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists deal_timeline_dossier on public.deal_timeline(dossier_id, created_at desc);

alter table public.deal_timeline enable row level security;
drop policy if exists "auth_insert_tl" on public.deal_timeline;
create policy "auth_insert_tl" on public.deal_timeline
  for insert to authenticated with check (true);
drop policy if exists "auth_read_tl" on public.deal_timeline;
create policy "auth_read_tl" on public.deal_timeline
  for select to authenticated using (true);
-- Sem update/delete: timeline é somente leitura para todos (A3.1)

-- ── Comentários do deal (A3.2) — imutáveis após envio ────────────────────────
create table if not exists public.deal_comments (
  id           bigserial primary key,
  dossier_id   text not null,
  author_email text not null,
  author_name  text,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists deal_comments_dossier on public.deal_comments(dossier_id, created_at);

alter table public.deal_comments enable row level security;
drop policy if exists "auth_insert_dc" on public.deal_comments;
create policy "auth_insert_dc" on public.deal_comments
  for insert to authenticated with check (true);
drop policy if exists "auth_read_dc" on public.deal_comments;
create policy "auth_read_dc" on public.deal_comments
  for select to authenticated using (true);
-- Sem update/delete: comentários não podem ser editados/excluídos (A3.2)

-- ── Histórico de atribuições (A9.3) — imutável ───────────────────────────────
create table if not exists public.deal_assignments (
  id            bigserial primary key,
  dossier_id    text not null,
  assigned_from uuid,
  assigned_to   uuid,
  by_user_email text,
  created_at    timestamptz not null default now()
);
create index if not exists deal_assignments_dossier on public.deal_assignments(dossier_id, created_at desc);

alter table public.deal_assignments enable row level security;
drop policy if exists "auth_insert_da" on public.deal_assignments;
create policy "auth_insert_da" on public.deal_assignments
  for insert to authenticated with check (true);
drop policy if exists "auth_read_da" on public.deal_assignments;
create policy "auth_read_da" on public.deal_assignments
  for select to authenticated using (true);
