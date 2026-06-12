-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005 — Persistência de documentos de viagem (spec 4.x + doc4 §5).
-- Metadados em doc_files + bucket privado 'documents' no Supabase Storage.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Metadados dos documentos ──────────────────────────────────────────────────
create table if not exists public.doc_files (
  id           bigserial primary key,
  dossier_ref  text not null,            -- booking-ref (chave primária de vínculo, doc4 §5.3)
  client_ref   text,                     -- vínculo com o perfil do cliente (spec 4.1)
  pax_index    int default 0,
  doc_key      text not null,            -- ex: 'visa-sur-out', 'passport', 'icf-in'
  pax_name     text,                     -- nome extraído do passaporte (nomeação automática)
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  storage_path text not null,            -- caminho no bucket 'documents'
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);

create index if not exists doc_files_dossier on public.doc_files(dossier_ref);
create index if not exists doc_files_client  on public.doc_files(client_ref);
create unique index if not exists doc_files_slot on public.doc_files(dossier_ref, pax_index, doc_key);

alter table public.doc_files enable row level security;
drop policy if exists "auth_all_doc_files" on public.doc_files;
create policy "auth_all_doc_files" on public.doc_files
  for all to authenticated using (true) with check (true);

-- ── Bucket privado 'documents' (acesso somente autenticado — spec 4.2) ───────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "auth_read_documents" on storage.objects;
create policy "auth_read_documents" on storage.objects
  for select to authenticated using (bucket_id = 'documents');

drop policy if exists "auth_write_documents" on storage.objects;
create policy "auth_write_documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');

drop policy if exists "auth_update_documents" on storage.objects;
create policy "auth_update_documents" on storage.objects
  for update to authenticated using (bucket_id = 'documents');

drop policy if exists "auth_delete_documents" on storage.objects;
create policy "auth_delete_documents" on storage.objects
  for delete to authenticated using (bucket_id = 'documents');
