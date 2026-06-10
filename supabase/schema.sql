-- ═══════════════════════════════════════════════════════════════════════════
-- Expatur Backoffice — Supabase Schema
-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES (roles: agent | admin) ──────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text not null,
  full_name   text,
  role        text not null default 'agent' check (role in ('agent', 'admin')),
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.profiles enable row level security;

-- Cada utilizador lê o seu próprio perfil
create policy "self_read" on public.profiles
  for select using (auth.uid() = id);

-- Função SECURITY DEFINER para verificar role sem recursão de RLS
-- (uma policy de profiles que consulta profiles entra em recursão infinita)
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

-- Admin lê todos os perfis
create policy "admin_read_all" on public.profiles
  for select using (public.is_admin());

-- Admin atualiza qualquer perfil
create policy "admin_update" on public.profiles
  for update using (public.is_admin());

-- Trigger: cria perfil automaticamente ao criar utilizador em auth.users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'agent')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. DOSSIERS ──────────────────────────────────────────────────────────────
create table if not exists public.dossiers (
  id          text primary key,        -- referência ex: 'QMPZPPUMAEXY'
  label       text,
  status      text default 'draft',    -- draft | invoiced | ticketing | ticketed | closed
  data        jsonb default '{}',      -- todos os campos do formulário
  created_by  uuid references auth.users,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.dossiers enable row level security;
create policy "auth_all_dossiers" on public.dossiers
  for all using (auth.uid() is not null);

-- Trigger: atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists dossiers_updated_at on public.dossiers;
create trigger dossiers_updated_at
  before update on public.dossiers
  for each row execute procedure public.set_updated_at();


-- ── 3. DOSSIER LIST (índice leve dos dossiers) ───────────────────────────────
create table if not exists public.dossier_list (
  id          text primary key,
  label       text,
  updated_at  timestamptz default now()
);

alter table public.dossier_list enable row level security;
create policy "auth_all_dossier_list" on public.dossier_list
  for all using (auth.uid() is not null);


-- ── 4. CLIENTS ───────────────────────────────────────────────────────────────
create table if not exists public.clients (
  ref         text primary key,        -- referência do dossier associado
  data        jsonb default '{}',      -- todos os campos do cliente
  created_by  uuid references auth.users,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.clients enable row level security;
create policy "auth_all_clients" on public.clients
  for all using (auth.uid() is not null);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();


-- ── 5. CLIENTS DB (base global de clientes) ──────────────────────────────────
create table if not exists public.clients_db (
  id          bigserial primary key,
  data        jsonb default '[]',      -- array completo de clientes
  updated_at  timestamptz default now()
);

alter table public.clients_db enable row level security;
create policy "auth_all_clients_db" on public.clients_db
  for all using (auth.uid() is not null);

-- Registo único (sempre upsert no id=1)
insert into public.clients_db (id, data) values (1, '[]')
  on conflict (id) do nothing;


-- ── 6. TASKS ─────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  ref         text primary key,        -- referência do dossier (tasks_v2_{ref})
  data        jsonb default '[]',      -- array de tarefas
  updated_at  timestamptz default now()
);

alter table public.tasks enable row level security;
create policy "auth_all_tasks" on public.tasks
  for all using (auth.uid() is not null);

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();


-- ── 7. BOOKINGS (estado de emissão) ──────────────────────────────────────────
create table if not exists public.bookings (
  dossier_id  text primary key references public.dossiers(id) on delete cascade,
  is_booked   boolean default false,
  booked_at   timestamptz,
  billet_data jsonb default '{}',
  updated_at  timestamptz default now()
);

alter table public.bookings enable row level security;
create policy "auth_all_bookings" on public.bookings
  for all using (auth.uid() is not null);


-- ── 8. KV STORE (chaves genéricas expatur_*) ─────────────────────────────────
-- Para chaves que não cabem nas tabelas acima (ex: configurações, cache FX)
create table if not exists public.kv_store (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);

alter table public.kv_store enable row level security;
create policy "auth_all_kv" on public.kv_store
  for all using (auth.uid() is not null);


-- ── INDEXES para performance ─────────────────────────────────────────────────
create index if not exists dossiers_created_by  on public.dossiers(created_by);
create index if not exists dossiers_updated_at  on public.dossiers(updated_at desc);
create index if not exists clients_updated_at   on public.clients(updated_at desc);
create index if not exists tasks_ref            on public.tasks(ref);
