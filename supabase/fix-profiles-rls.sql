-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: recursão infinita nas policies RLS de public.profiles
--
-- Problema: "admin_read_all" e "admin_update" consultam a própria tabela
-- profiles dentro da policy → "infinite recursion detected in policy for
-- relation profiles" em qualquer SELECT (quebra a listagem de utilizadores
-- no painel Admin).
--
-- Solução: função SECURITY DEFINER (corre como owner, ignora RLS) para
-- verificar o role, e policies que a usam.
--
-- ▶ Execute este arquivo no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Recriar as policies sem recursão
drop policy if exists "admin_read_all" on public.profiles;
create policy "admin_read_all" on public.profiles
  for select using (public.is_admin());

drop policy if exists "admin_update" on public.profiles;
create policy "admin_update" on public.profiles
  for update using (public.is_admin());
