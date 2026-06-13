-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 006 — Reforço de permissões: só o usuário supremo altera as
-- colunas de acesso/atribuição/visibilidade de profiles (spec A1.1, A9.5).
-- Idempotente. Aplicar no SQL Editor do Supabase Dashboard.
--
-- As colunas de permissão (permissions, can_assign_deals, deal_visibility,
-- team_user_ids) foram criadas na migration 003. O cliente já restringe a UI
-- ao supremo; este trigger garante o mesmo no backend (defesa em profundidade),
-- inclusive impedindo que os acessos do próprio supremo sejam alterados por
-- terceiros ("ninguém altera os acessos dele").
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_supreme_permission_edits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Mudou alguma coluna de permissão?
  if ( new.permissions       is distinct from old.permissions
    or new.can_assign_deals  is distinct from old.can_assign_deals
    or new.deal_visibility   is distinct from old.deal_visibility
    or new.team_user_ids     is distinct from old.team_user_ids )
     and not public.is_supreme() then
    raise exception 'Seul l''utilisateur suprême peut modifier les accès (profile %).', new.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_supreme_perms on public.profiles;
create trigger trg_enforce_supreme_perms
  before update on public.profiles
  for each row execute function public.enforce_supreme_permission_edits();
