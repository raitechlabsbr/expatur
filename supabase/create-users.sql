-- ═══════════════════════════════════════════════════════════════════════════
-- Expatur — Criar utilizadores admin e agent
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_id  uuid;
  v_agent_id  uuid;
BEGIN

  -- ── 1. Criar utilizador ADMIN ─────────────────────────────────────────────
  -- Verifica se já existe
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@expatur.com.br';

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      recovery_sent_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud,
      is_super_admin
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@expatur.com.br',
      crypt('123123', gen_salt('bf', 10)),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"admin","full_name":"Admin Expatur"}'::jsonb,
      now(),
      now(),
      'authenticated',
      'authenticated',
      false
    );

    -- Identity para o provider email
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      created_at,
      updated_at,
      last_sign_in_at
    ) VALUES (
      gen_random_uuid(),
      v_admin_id,
      'admin@expatur.com.br',
      'email',
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@expatur.com.br'),
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Admin criado com id: %', v_admin_id;
  ELSE
    RAISE NOTICE 'Admin já existe com id: %', v_admin_id;
  END IF;

  -- Garante perfil com role=admin
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (v_admin_id, 'admin@expatur.com.br', 'admin', 'Admin Expatur')
  ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Admin Expatur';


  -- ── 2. Criar utilizador AGENT ─────────────────────────────────────────────
  SELECT id INTO v_agent_id FROM auth.users WHERE email = 'agent@expatur.com.br';

  IF v_agent_id IS NULL THEN
    v_agent_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      recovery_sent_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud,
      is_super_admin
    ) VALUES (
      v_agent_id,
      '00000000-0000-0000-0000-000000000000',
      'agent@expatur.com.br',
      crypt('123123', gen_salt('bf', 10)),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"agent","full_name":"Agent Expatur"}'::jsonb,
      now(),
      now(),
      'authenticated',
      'authenticated',
      false
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      created_at,
      updated_at,
      last_sign_in_at
    ) VALUES (
      gen_random_uuid(),
      v_agent_id,
      'agent@expatur.com.br',
      'email',
      jsonb_build_object('sub', v_agent_id::text, 'email', 'agent@expatur.com.br'),
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Agent criado com id: %', v_agent_id;
  ELSE
    RAISE NOTICE 'Agent já existe com id: %', v_agent_id;
  END IF;

  -- Garante perfil com role=agent
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (v_agent_id, 'agent@expatur.com.br', 'agent', 'Agent Expatur')
  ON CONFLICT (id) DO UPDATE SET role = 'agent', full_name = 'Agent Expatur';

END $$;

-- ── Verificação final ─────────────────────────────────────────────────────────
SELECT
  u.email,
  p.role,
  p.full_name,
  u.email_confirmed_at IS NOT NULL AS confirmed,
  u.created_at
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email IN ('admin@expatur.com.br', 'agent@expatur.com.br')
ORDER BY p.role;
