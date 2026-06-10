-- ═══════════════════════════════════════════════════════════════════════════
-- Expatur Backoffice — Audit log (opcional)
-- Tabela lida pelo painel Admin (aba Audit). Sem ela, o painel mostra
-- "No audit entries." graciosamente. Execute no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_log (
  id           bigserial primary key,
  action       text not null,
  actor_email  text,
  target       text,
  created_at   timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Qualquer utilizador autenticado pode registar eventos
create policy "auth_insert_audit" on public.audit_log
  for insert to authenticated with check (true);

-- Só admin lê o log
create policy "admin_read_audit" on public.audit_log
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create index if not exists audit_log_created_at on public.audit_log(created_at desc);
