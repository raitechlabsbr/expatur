-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001 — Menu PROGRAMAS (spec A5) + emissões vinculadas (A5.4/A5.5)
-- Idempotente. Executar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Programas de fidelidade / fournisseurs ───────────────────────────────────
create table if not exists public.programs (
  id          bigserial primary key,
  name        text not null unique,
  active      boolean not null default true,
  -- presets opcionais usados pelo Cost Calculator (espelha PRESETS do app)
  cpm         numeric,
  fee         numeric,
  extra       numeric,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.programs enable row level security;
drop policy if exists "auth_all_programs" on public.programs;
create policy "auth_all_programs" on public.programs
  for all to authenticated using (true) with check (true);

-- ── Emissões vinculadas a programa (A5.4/A5.5) — geradas pelo sistema ────────
create table if not exists public.program_emissions (
  id           bigserial primary key,
  program_name text not null,             -- coluna FOURNISSEUR do Cost Calculator
  dossier_id   text not null,             -- deal_id
  dossier_ref  text,                      -- número do dossier (booking-ref)
  volume_miles numeric default 0,         -- coluna VOLUME (MILES)
  cpm_brl      numeric default 0,         -- coluna C.P.M (R$)
  taxas_brl    numeric default 0,         -- coluna TAXAS (R$)
  extra_brl    numeric default 0,         -- coluna EXTRA (R$)
  subtotal_brl numeric default 0,         -- coluna SOUS-TOTAL (R$)
  pnr          text,
  vendedor     text,                      -- dropdown vendedor em Ticketing
  emitted_at   timestamptz not null default now(),  -- data do status ticketed
  created_by   uuid references auth.users(id)
);

create index if not exists program_emissions_prog  on public.program_emissions(program_name);
create index if not exists program_emissions_dos   on public.program_emissions(dossier_id);
create index if not exists program_emissions_date  on public.program_emissions(emitted_at desc);

alter table public.program_emissions enable row level security;
drop policy if exists "auth_insert_pe" on public.program_emissions;
create policy "auth_insert_pe" on public.program_emissions
  for insert to authenticated with check (true);
drop policy if exists "auth_read_pe" on public.program_emissions;
create policy "auth_read_pe" on public.program_emissions
  for select to authenticated using (true);
-- Sem update/delete: dados gerados pelas emissões não são editáveis (A5.8)

-- ── Seed dos 11 programas iniciais (A5.1) com presets atuais do app ─────────
insert into public.programs (name, cpm, fee, extra) values
  ('Smiles',             16.5,  33.64, 130),
  ('Copa',               null,  null,  null),
  ('Latam Pass',         28,    33.64, null),
  ('Latam Tabela Fixa',  null,  null,  null),
  ('Air France',         null,  null,  null),
  ('APM',                null,  null,  null),
  ('Azul Fidelidade',    null,  null,  null),
  ('QR Privilege Club',  null,  null,  null),
  ('Consolidator',       null,  null,  null),
  ('VISA / E.T.A',       null,  null,  null),
  ('Volta Cancelada',    null,  null,  null)
on conflict (name) do nothing;
