/**
 * backup.mjs — Backup diário do Expatur Backoffice (spec 10.x — Fase 10)
 *
 * Faz, num único arquivo criptografado:
 *   - Dump de todas as tabelas do banco (REST + service key, paginado).
 *   - Download do bucket privado de documentos (Storage REST).
 *   - Configs/logs (system_log, audit_log, doc_access_log) — incluídos no dump.
 *   - manifest.json com contagens, versão e timestamp UTC.
 * Em seguida: tar.gz → openssl aes-256 (criptografia em repouso) → sha256
 * (verificação de integridade) → retenção (remove backups > N dias).
 * Em falha: registra em system_log (module=backup) + webhook opcional + exit 1
 * (cron com MAILTO avisa o admin).
 *
 * Usa apenas fetch (sem @supabase/supabase-js) — portável em qualquer Node 18+.
 *
 * Uso (na VPS, via cron ~02h):
 *   SUPABASE_SERVICE_KEY=… BACKUP_PASSPHRASE=… node scripts/backup.mjs
 *
 * Variáveis: ver docs/BACKUP.md.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv(file) {
  const path = resolve(__dir, '..', file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv('.env'); loadEnv('.env.local');

const SUPABASE_URL   = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const PASSPHRASE     = process.env.BACKUP_PASSPHRASE || '';
const BACKUP_DIR     = process.env.BACKUP_DIR || '/var/backups/expatur';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const BUCKET         = process.env.BACKUP_BUCKET || 'documents';
const REMOTE         = process.env.BACKUP_REMOTE || '';
const ALERT_WEBHOOK  = process.env.BACKUP_ALERT_WEBHOOK || '';

const TABLES = [
  'profiles', 'dossiers', 'dossier_list', 'clients', 'clients_db', 'tasks', 'kv_store',
  'programs', 'program_emissions',
  'deal_timeline', 'deal_comments', 'deal_assignments',
  'doc_files', 'doc_access_log',
  'audit_log', 'system_log',
];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias.');
  process.exit(1);
}

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const log = (...a) => console.log(`[backup ${new Date().toISOString()}]`, ...a);
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function logRow(action_type, value) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/system_log`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ action_type, module: 'backup', field_changed: 'backup', new_value: String(value).slice(0, 500) }),
    });
  } catch (_) {}
}

async function alertFailure(message) {
  console.error('❌', message);
  await logRow('BACKUP_FAILED', message);
  if (ALERT_WEBHOOK) {
    try {
      await fetch(ALERT_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `⚠️ Expatur backup FALHOU: ${message}` }) });
    } catch (_) {}
  }
}

async function dumpTable(table) {
  const page = 1000;
  let offset = 0, all = [];
  for (;;) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${page}&offset=${offset}`, { headers: H });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${await r.text()}`);
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < page) break;
    offset += page;
  }
  return all;
}

// Storage REST: lista recursiva
async function listStorage(prefix, out) {
  let offset = 0;
  for (;;) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`storage list ${prefix}: HTTP ${r.status} ${await r.text()}`);
    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id == null && it.metadata == null) await listStorage(p, out); // pasta
      else out.push(p);
    }
    if (items.length < 1000) break;
    offset += 1000;
  }
}

async function downloadStorage(path) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encPath(path)}`, { headers: H });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  if (!PASSPHRASE) log('⚠️  BACKUP_PASSPHRASE ausente — o arquivo NÃO será criptografado.');
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stage = join(BACKUP_DIR, `stage-${stamp}`);
  const dbDir = join(stage, 'db');
  const stDir = join(stage, 'storage');
  mkdirSync(dbDir, { recursive: true });
  mkdirSync(stDir, { recursive: true });

  const manifest = { created_at: new Date().toISOString(), tables: {}, storage_files: 0, version: '2026.1' };

  // 1) Banco
  for (const t of TABLES) {
    try {
      const rows = await dumpTable(t);
      writeFileSync(join(dbDir, `${t}.json`), JSON.stringify(rows));
      manifest.tables[t] = rows.length;
      log(`db ${t}: ${rows.length} linhas`);
    } catch (e) {
      if (/HTTP 404/.test(e.message)) { log(`db ${t}: ausente (ignorado)`); manifest.tables[t] = null; }
      else throw e;
    }
  }

  // 2) Storage (documentos)
  const files = [];
  try {
    await listStorage('', files);
    for (const f of files) {
      try {
        const buf = await downloadStorage(f);
        const dest = join(stDir, f);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
      } catch (e) { log(`storage ${f}: ${e.message} (ignorado)`); }
    }
    manifest.storage_files = files.length;
    log(`storage: ${files.length} arquivos`);
  } catch (e) {
    log(`storage indisponível (${e.message}) — seguindo só com o banco`);
  }

  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 3) tar.gz
  const tgz = join(BACKUP_DIR, `expatur-backup-${stamp}.tar.gz`);
  execFileSync('tar', ['-czf', tgz, '-C', stage, '.']);
  rmSync(stage, { recursive: true, force: true });

  // 4) Criptografia em repouso (openssl aes-256, pbkdf2)
  let finalFile = tgz;
  if (PASSPHRASE) {
    const enc = `${tgz}.enc`;
    execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-salt', '-in', tgz, '-out', enc,
      '-pass', 'env:BACKUP_PASSPHRASE'], { env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE } });
    rmSync(tgz, { force: true });
    finalFile = enc;
  }

  // 5) Checksum (integridade)
  const sum = execFileSync('sha256sum', [finalFile]).toString().split(' ')[0];
  writeFileSync(`${finalFile}.sha256`, `${sum}  ${finalFile.split('/').pop()}\n`);
  log(`arquivo: ${finalFile}`);
  log(`sha256 : ${sum}`);

  // 6) Off-site (opcional)
  if (REMOTE) {
    try {
      execFileSync('rsync', ['-az', finalFile, `${finalFile}.sha256`, REMOTE], { stdio: 'inherit' });
      log(`enviado off-site → ${REMOTE}`);
    } catch (e) { await alertFailure(`rsync off-site falhou: ${e.message}`); }
  }

  // 7) Retenção (remove > N dias)
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const f of readdirSync(BACKUP_DIR)) {
    if (!/^expatur-backup-/.test(f)) continue;
    const fp = join(BACKUP_DIR, f);
    try { if (statSync(fp).mtimeMs < cutoff) { rmSync(fp, { force: true }); log(`retenção: removido ${f}`); } } catch (_) {}
  }

  // 8) Log de sucesso
  await logRow('BACKUP_OK', `${Object.keys(manifest.tables).length} tabelas, ${manifest.storage_files} docs, sha256 ${sum.slice(0, 12)}…`);
  log('✅ backup concluído.');
}

main().catch(async (e) => { await alertFailure(e.message || String(e)); process.exit(1); });
