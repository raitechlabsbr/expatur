# Migrations — como aplicar

O projeto não tem acesso DDL via API (somente anon/service key REST). Aplicar cada arquivo
**no SQL Editor do Supabase Dashboard** (https://supabase.com/dashboard → projeto
`jjmnczfrjnbqwfktevoh` → SQL Editor), **na ordem numérica**:

1. `001_programs.sql` — tabelas `programs` + `program_emissions` + seed dos 11 programas (A5)
2. `002_deal_status_timeline_comments.sql` — colunas de status/atribuição em `dossiers`, `deal_timeline`, `deal_comments`, `deal_assignments` (1.x, A3, A9)
3. `003_profiles_permissions.sql` — permissões por menu, usuário supremo, visibilidade com RLS (A1, A9)
4. `004_system_log.sql` — log geral imutável + log de acesso a documentos (A2, 4.2)
5. `005_doc_files_storage.sql` — metadados de documentos + bucket privado `documents` (4.x, doc4 §5)

Todos os arquivos são idempotentes — reexecutar não causa erro nem duplica dados.

⚠️ `003` substitui a policy permissiva `auth_all_dossiers` por policies com visibilidade.
Dossiers legados (sem `created_by`/`assigned_to`) permanecem visíveis a todos.

⚠️ O usuário supremo precisa existir no auth: criar `administration@expaturtravel.com`
via `scripts/setup-users.mjs` ou painel do Supabase, se ainda não existir.
