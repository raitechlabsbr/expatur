-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004 — Log geral de alterações do sistema (spec A2). Idempotente.
-- Log imutável, leitura apenas pelo usuário supremo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.system_log (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),      -- timestamp UTC
  user_id       uuid,
  user_email    text,
  action_type   text not null,    -- CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN | LOGOUT | UPLOAD | PERMISSION_CHANGE | ASSIGN
  module        text not null,    -- ticketing | financeiro | clientes | tarefas | fornecedores | vendedores | programas | usuarios | documentos
  entity_id     text,             -- deal_id, client_id, invoice_id…
  field_changed text,
  old_value     text,
  new_value     text,
  ip_address    text
);

create index if not exists system_log_created on public.system_log(created_at desc);
create index if not exists system_log_user    on public.system_log(user_email);
create index if not exists system_log_module  on public.system_log(module);
create index if not exists system_log_entity  on public.system_log(entity_id);

alter table public.system_log enable row level security;

-- Qualquer autenticado registra eventos
drop policy if exists "auth_insert_syslog" on public.system_log;
create policy "auth_insert_syslog" on public.system_log
  for insert to authenticated with check (true);

-- Apenas o supremo lê o log (A2.3)
drop policy if exists "supreme_read_syslog" on public.system_log;
create policy "supreme_read_syslog" on public.system_log
  for select using (public.is_supreme());

-- Imutável: sem policies de update/delete — nem o supremo altera entradas (A2.3)

-- ── Log de acesso a documentos (spec 4.2 — quem visualizou/baixou) ───────────
create table if not exists public.doc_access_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_email  text,
  doc_id      bigint,
  action      text not null default 'download',   -- view | download
  dossier_ref text
);
alter table public.doc_access_log enable row level security;
drop policy if exists "auth_insert_dal" on public.doc_access_log;
create policy "auth_insert_dal" on public.doc_access_log
  for insert to authenticated with check (true);
drop policy if exists "supreme_read_dal" on public.doc_access_log;
create policy "supreme_read_dal" on public.doc_access_log
  for select using (public.is_supreme());
