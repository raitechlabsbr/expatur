-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 007 — Modelo de dois níveis por role (admin = topo, agent).
-- Substitui o conceito de "usuário supremo por email" (migrations 003/006).
-- Idempotente. Aplicar no SQL Editor do Supabase Dashboard.
--
-- Decisão: não há usuário supremo. O nível superior é o role `admin`, que
-- gerencia permissões/atribuição/visibilidade e lê os logs (Journal, Fase 7).
-- `agent` é o usuário padrão.
--
-- Em vez de tocar em cada policy/trigger que referencia is_supreme(), apenas
-- redefinimos a função para delegar a is_admin() (role-based). Tudo que dependia
-- de is_supreme() (supreme_all_profiles em profiles, leitura de system_log e
-- doc_access_log na migration 004, can_see_dossier na 003, trigger da 006)
-- passa a valer para qualquer admin, sem outras alterações de schema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Nível superior = role 'admin' ────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- is_supreme() vira alias de is_admin() — mantém policies/triggers existentes
-- válidos sem precisar recriá-los.
create or replace function public.is_supreme()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin();
$$;

-- ── Trigger de proteção das colunas de acesso (mensagem atualizada) ──────────
create or replace function public.enforce_supreme_permission_edits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if ( new.permissions       is distinct from old.permissions
    or new.can_assign_deals  is distinct from old.can_assign_deals
    or new.deal_visibility   is distinct from old.deal_visibility
    or new.team_user_ids     is distinct from old.team_user_ids )
     and not public.is_admin() then
    raise exception 'Seuls les administrateurs peuvent modifier les accès (profile %).', new.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- (o trigger trg_enforce_supreme_perms da migration 006 continua válido —
--  aponta para a função acima, agora role-based.)
