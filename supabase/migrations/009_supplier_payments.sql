-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009 — Ledger de fornecedores ("Abertos"): estado Pago/Pendente
-- compartilhado por linha de custo (source_id). Substitui o sync Cloudflare
-- ds=emissao_pagos. Compartilhado total (RLS aberta p/ authenticated). Idempotente.
-- Spec: docs/superpowers/specs/2026-07-04-supplier-ledger-design.md
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.supplier_payments (
  source_id   text primary key,
  status      text not null default 'pendente' check (status in ('pago','pendente')),
  dossier_ref text not null default '',
  paid_at     timestamptz,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);

create index if not exists supplier_payments_dossier_idx on public.supplier_payments (dossier_ref);

alter table public.supplier_payments enable row level security;

drop policy if exists "supplier_payments_auth_all" on public.supplier_payments;
create policy "supplier_payments_auth_all" on public.supplier_payments
  for all to authenticated using (true) with check (true);
