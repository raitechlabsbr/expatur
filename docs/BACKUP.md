# Backup diário & Restauração (spec 10.x — Fase 10)

Backup diário do banco completo + documentos (Storage) + configs/logs, cifrado
em repouso, com checksum, retenção ≥ 30 dias, off-site opcional e alerta em
falha. Scripts: [`scripts/backup.mjs`](../scripts/backup.mjs) e
[`scripts/restore.mjs`](../scripts/restore.mjs).

## O que é salvo (10.1)

- **Banco** (dump JSON, paginado, via REST + service key): `profiles`, `dossiers`,
  `dossier_list`, `clients`, `clients_db`, `tasks`, `kv_store`, `programs`,
  `program_emissions`, `deal_timeline`, `deal_comments`, `deal_assignments`,
  `doc_files`, `doc_access_log`, `audit_log`, `system_log`.
- **Documentos**: todos os arquivos do bucket privado `documents` (Storage).
- **Configs/logs**: `system_log`, `audit_log`, `doc_access_log` (no dump acima).
- **manifest.json**: contagem por tabela, nº de documentos, timestamp UTC, versão.

Pipeline: dump → `tar.gz` → `openssl aes-256-cbc` (criptografia em repouso, 10.2)
→ `sha256` (integridade, 10.2) → retenção (10.2) → off-site opcional (10.2)
→ log em `system_log` (sucesso/falha).

## Variáveis de ambiente

Colocar em `/var/www/expatur-backoffice/.env.local` (não commitado):

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `VITE_SUPABASE_URL` | sim | — | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | sim | — | service_role key (Dashboard → Settings → API) |
| `BACKUP_PASSPHRASE` | recomendada | — | senha de criptografia; **sem ela o arquivo NÃO é cifrado** |
| `BACKUP_DIR` | não | `/var/backups/expatur` | destino dos backups |
| `BACKUP_RETENTION_DAYS` | não | `30` | dias de retenção |
| `BACKUP_BUCKET` | não | `documents` | bucket de Storage |
| `BACKUP_REMOTE` | não | — | alvo rsync off-site, ex. `user@host:/backups/expatur` |
| `BACKUP_ALERT_WEBHOOK` | não | — | URL que recebe `POST {text}` em falha |

> ⚠️ Guarde a `BACKUP_PASSPHRASE` **fora** da VPS (gerenciador de senhas). Sem
> ela os backups cifrados são irrecuperáveis.

## Instalação do cron na VPS (~02h — 10.2)

VPS: `72.60.243.106` · app em `/var/www/expatur-backoffice`.

```bash
# 1. diretório de backups e logs
sudo mkdir -p /var/backups/expatur
sudo chown "$USER" /var/backups/expatur

# 2. testar manualmente uma vez (deve criar expatur-backup-*.tar.gz.enc + .sha256)
cd /var/www/expatur-backoffice
node scripts/backup.mjs

# 3. agendar no crontab (02h, horário do servidor)
crontab -e
```

Adicionar ao crontab (o `MAILTO` recebe o stderr/stdout em caso de falha):

```cron
MAILTO=raitechlabsbr@gmail.com
0 2 * * * cd /var/www/expatur-backoffice && /usr/bin/node scripts/backup.mjs >> /var/backups/expatur/backup.log 2>&1
```

> Ajuste o fuso: se o servidor estiver em UTC e quiser 02h de São Paulo, use
> `0 5 * * *`. Confirme com `date`.

### Off-site (10.2)

O backup deve viver **fora do servidor principal**. Opções:

- **rsync** (recomendado): definir `BACKUP_REMOTE=user@host:/backups/expatur` com
  chave SSH sem senha para o destino. O script faz o envio automaticamente.
- **rclone** para um bucket S3/Backblaze/Drive: agendar logo após o backup:
  ```cron
  30 2 * * * rclone copy /var/backups/expatur remote:expatur-backups --max-age 25h
  ```

## Restauração (10.3)

A restauração é **destrutiva** — por padrão o script só verifica o checksum,
descriptografa e extrai. Reimportar exige `--yes`.

```bash
cd /var/www/expatur-backoffice

# 1. só extrair + verificar integridade (seguro)
node scripts/restore.mjs /var/backups/expatur/expatur-backup-AAAA-MM-DD-HH-MM.tar.gz.enc

# 2. restaurar UMA tabela (upsert por chave)
node scripts/restore.mjs <arquivo.enc> --import-table dossiers --yes

# 3. restaurar TODO o banco (upsert em todas as tabelas)
node scripts/restore.mjs <arquivo.enc> --import-db --yes

# 4. reenviar os documentos ao Storage
node scripts/restore.mjs <arquivo.enc> --import-storage --yes
```

Notas:
- A reimportação usa **upsert** pela chave primária (`id`, ou `key` para
  `kv_store`) — restaura/atualiza sem apagar linhas mais novas. Para um restore
  "limpo" a um ponto no tempo, truncar as tabelas no SQL Editor antes (cuidado).
- Restaurar "por data": escolha o arquivo `expatur-backup-<data>` desejado.
- O front lê do `localStorage` espelhado no Supabase; após restaurar o banco,
  os navegadores re-hidratam no próximo login.

## Teste de restauração (recomendado — 10.3)

Periodicamente, validar que o backup é restaurável:

1. Criar um projeto Supabase de teste (ou schema separado) com as migrations 001–007.
2. `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_KEY` apontando para o teste.
3. `node scripts/restore.mjs <último.enc> --import-db --import-storage --yes`.
4. Conferir contagens contra o `manifest.json`.

## Alerta em falha (10.2)

Em qualquer erro o `backup.mjs`:
- grava `action_type=BACKUP_FAILED, module=backup` em `system_log` (visível no
  painel **Journal**, filtrando módulo `backup`);
- faz `POST {text}` em `BACKUP_ALERT_WEBHOOK` se definido;
- sai com código 1 → o `MAILTO` do cron envia e-mail ao admin.

Sucesso grava `action_type=BACKUP_OK` no mesmo log.
