-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008 — Vols (Departures): quadro de partidas compartilhado.
-- Uma linha por segmento de voo. Compartilhado total entre postos (RLS aberta
-- p/ authenticated). Populado por: emissão (source='emit'), manual ('manual'),
-- seed único das reservas existentes ('seed'). Idempotente.
-- Spec: docs/superpowers/specs/2026-07-03-vols-departures-design.md
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.flights (
  id          uuid primary key default gen_random_uuid(),
  flight_date date not null,
  flight_num  text not null default '',
  dep_code    text not null default '',
  dep_time    text not null default '',
  arr_code    text not null default '',
  arr_time    text not null default '',
  pnr         text not null default '',
  client      text not null default '',
  dossier_ref text not null default '',
  source      text not null default 'manual',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Dedupe: uma linha por (data, origem, destino, pnr) — SEM flight_num na chave
-- (fix review final): um segmento capturado primeiro sem flight_num (seed/emit
-- incompleto) e depois recapturado com o número real do voo deve enriquecer a
-- MESMA linha, não duplicar por ter um flight_num diferente. flight_num continua
-- sendo uma coluna enriquecível (vide flights_upsert), só não faz parte da chave.
-- Colunas de chave são NOT NULL default '' para o índice unique nunca ver NULL
-- (NULLs são distintos). Chave: (flight_date, dep_code, arr_code, pnr).
create unique index if not exists flights_dedupe_key
  on public.flights (flight_date, dep_code, arr_code, pnr);

-- Query do board e do widget da semana filtram por data.
create index if not exists flights_flight_date_idx on public.flights (flight_date);

-- ── RLS: compartilhado total (decisão 3 da spec) ────────────────────────────
alter table public.flights enable row level security;

drop policy if exists "flights_auth_all" on public.flights;
create policy "flights_auth_all" on public.flights
  for all to authenticated using (true) with check (true);

-- ── Upsert com merge server-side (replica o dedupe/enriquecimento do Worker) ──
-- Para cada linha: insere; em conflito na chave de dedupe, preenche client/
-- dossier_ref/dep_time/arr_time/flight_num APENAS se estiverem vazios na linha
-- existente (uma emissão mais completa enriquece; nunca sobrescreve com vazio).
create or replace function public.flights_upsert(rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    insert into public.flights
      (flight_date, flight_num, dep_code, dep_time, arr_code, arr_time, pnr, client, dossier_ref, source)
    values (
      (r->>'flight_date')::date,
      coalesce(r->>'flight_num',''),
      coalesce(r->>'dep_code',''),
      coalesce(r->>'dep_time',''),
      coalesce(r->>'arr_code',''),
      coalesce(r->>'arr_time',''),
      coalesce(r->>'pnr',''),
      coalesce(r->>'client',''),
      coalesce(r->>'dossier_ref',''),
      coalesce(r->>'source','manual')
    )
    on conflict (flight_date, dep_code, arr_code, pnr) do update set
      client      = case when flights.client      = '' then excluded.client      else flights.client      end,
      dossier_ref = case when flights.dossier_ref = '' then excluded.dossier_ref else flights.dossier_ref end,
      dep_time    = case when flights.dep_time     = '' then excluded.dep_time     else flights.dep_time     end,
      arr_time    = case when flights.arr_time     = '' then excluded.arr_time     else flights.arr_time     end,
      -- flight_num fora da chave de dedupe: este enriquecimento agora é o único
      -- jeito de um número real de voo preencher uma linha antes vazia (fix review final).
      flight_num  = case when flights.flight_num   = '' then excluded.flight_num   else flights.flight_num   end;
  end loop;
end;
$$;
