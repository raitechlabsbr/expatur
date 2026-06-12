-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 003 — Permissões por menu, usuário supremo, atribuição e
-- visibilidade de deals (spec A1, A9). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Permissões por módulo (A1.2) + configurações de deals (A9.5) ─────────────
-- permissions: jsonb { access_ticketing: true, access_bookings: true, ... }
alter table public.profiles add column if not exists permissions jsonb not null default
  '{"access_ticketing":true,"access_bookings":true,"access_fornecedores":true,"access_vendedores":true,"access_disponibilidades":true,"access_tarefas":true,"access_clientes":true,"access_financeiro":true}'::jsonb;
alter table public.profiles add column if not exists can_assign_deals boolean not null default false;
alter table public.profiles add column if not exists deal_visibility  text not null default 'own'
  check (deal_visibility in ('own','team','all'));
alter table public.profiles add column if not exists team_user_ids uuid[] not null default '{}';

-- ── Usuário supremo (A1.1): administration@expaturtravel.com ─────────────────
create or replace function public.is_supreme()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and lower(email) = 'administration@expaturtravel.com'
  );
$$;

-- Supremo pode tudo em profiles; demais usuários não alteram permissões.
-- (mantém policies existentes self_read/admin_read_all/admin_update)
drop policy if exists "supreme_all_profiles" on public.profiles;
create policy "supreme_all_profiles" on public.profiles
  for all using (public.is_supreme()) with check (public.is_supreme());

-- Todos os autenticados leem perfis (necessário p/ dropdown "Atribuído a")
drop policy if exists "auth_read_profiles_basic" on public.profiles;
create policy "auth_read_profiles_basic" on public.profiles
  for select to authenticated using (true);

-- ── Visibilidade de deals aplicada no backend (A9.4 — exigência de RLS) ──────
-- Função: o usuário corrente pode ver o dossier?
create or replace function public.can_see_dossier(d_created_by uuid, d_assigned_to uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select
    public.is_supreme()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.deal_visibility = 'all'
          or p.role = 'admin'
          -- deals próprios (criados por ou atribuídos a mim) sempre visíveis
          or d_created_by  = auth.uid()
          or d_assigned_to = auth.uid()
          -- legado: dossiers sem dono visíveis a todos (pré-migração)
          or (d_created_by is null and d_assigned_to is null)
          -- visibilidade de equipe
          or (p.deal_visibility = 'team'
              and (d_created_by = any(p.team_user_ids) or d_assigned_to = any(p.team_user_ids)))
        )
    );
$$;

-- Substitui a policy permissiva de dossiers pela versão com visibilidade
drop policy if exists "auth_all_dossiers" on public.dossiers;
drop policy if exists "dossiers_select_visible" on public.dossiers;
create policy "dossiers_select_visible" on public.dossiers
  for select to authenticated
  using (public.can_see_dossier(created_by, assigned_to));
drop policy if exists "dossiers_write_auth" on public.dossiers;
create policy "dossiers_write_auth" on public.dossiers
  for insert to authenticated with check (true);
drop policy if exists "dossiers_update_visible" on public.dossiers;
create policy "dossiers_update_visible" on public.dossiers
  for update to authenticated
  using (public.can_see_dossier(created_by, assigned_to));
drop policy if exists "dossiers_delete_visible" on public.dossiers;
create policy "dossiers_delete_visible" on public.dossiers
  for delete to authenticated
  using (public.can_see_dossier(created_by, assigned_to));
