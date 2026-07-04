/**
 * restore.mjs — Restauração de um backup do Expatur (spec 10.3 — Fase 10)
 *
 * Verifica o checksum, descriptografa e extrai um backup; opcionalmente
 * reimporta tabelas (upsert) e/ou os documentos (Storage). Restauração é
 * destrutiva por natureza — por padrão só extrai e mostra o que faria.
 *
 * Usa apenas fetch (sem @supabase/supabase-js) — portável em qualquer Node 18+.
 *
 * Uso:
 *   node scripts/restore.mjs <arquivo.tar.gz[.enc]> [opções]
 *     --out <dir>            diretório de extração (padrão ./restore-<stamp>)
 *     --import-db            reimporta TODAS as tabelas (upsert por chave)
 *     --import-table <nome>  reimporta só uma tabela
 *     --import-storage       reenvia os documentos ao bucket
 *     --yes                  confirma as operações destrutivas
 *
 * Variáveis: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, BACKUP_PASSPHRASE,
 *            BACKUP_BUCKET (padrão documents).
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
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

const args = process.argv.slice(2);
const file = args[0];
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] || true) : null; };
const flag = (name) => args.includes(name);

if (!file || !existsSync(file)) {
  console.error('Uso: node scripts/restore.mjs <arquivo.tar.gz[.enc]> [--out dir] [--import-db|--import-table nome] [--import-storage] [--yes]');
  process.exit(1);
}

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const PASSPHRASE   = process.env.BACKUP_PASSPHRASE || '';
const BUCKET       = process.env.BACKUP_BUCKET || 'documents';
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const outDir = String(opt('--out') || `./restore-${stamp}`);
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

const PK = {
  profiles: 'id', dossiers: 'id', dossier_list: 'id', clients: 'id', clients_db: 'id',
  tasks: 'id', kv_store: 'key', programs: 'id', program_emissions: 'id',
  deal_timeline: 'id', deal_comments: 'id', deal_assignments: 'id',
  doc_files: 'id', doc_access_log: 'id', audit_log: 'id', system_log: 'id',
};

function verifyChecksum() {
  const sumFile = `${file}.sha256`;
  if (!existsSync(sumFile)) { console.warn('⚠️  .sha256 ausente — pulando verificação de integridade.'); return; }
  const expected = readFileSync(sumFile, 'utf8').trim().split(/\s+/)[0];
  const actual = execFileSync('sha256sum', [file]).toString().split(' ')[0];
  if (expected !== actual) { console.error(`❌ Checksum NÃO confere!\n  esperado: ${expected}\n  obtido  : ${actual}`); process.exit(1); }
  console.log('✓ Checksum OK');
}

function extract() {
  mkdirSync(outDir, { recursive: true });
  let tgz = file;
  if (file.endsWith('.enc')) {
    if (!PASSPHRASE) { console.error('❌ Arquivo cifrado: defina BACKUP_PASSPHRASE.'); process.exit(1); }
    tgz = join(outDir, '_backup.tar.gz');
    execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-in', file, '-out', tgz,
      '-pass', 'env:BACKUP_PASSPHRASE'], { env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE } });
  }
  execFileSync('tar', ['-xzf', tgz, '-C', outDir]);
  console.log(`✓ Extraído em ${outDir}`);
  try { console.log('manifest:', readFileSync(join(outDir, 'manifest.json'), 'utf8')); } catch (_) {}
}

function requireCreds() {
  if (!SUPABASE_URL || !SERVICE_KEY) { console.error('❌ VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias para importar.'); process.exit(1); }
}

async function importTable(table) {
  const f = join(outDir, 'db', `${table}.json`);
  if (!existsSync(f)) { console.warn(`  ${table}: arquivo ausente`); return; }
  const rows = JSON.parse(readFileSync(f, 'utf8'));
  if (!Array.isArray(rows) || !rows.length) { console.log(`  ${table}: 0 linhas`); return; }
  const pk = PK[table] || 'id';
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${pk}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) { console.error(`  ${table}: HTTP ${r.status} ${await r.text()}`); return; }
  }
  console.log(`  ✓ ${table}: ${rows.length} linhas (upsert por ${pk})`);
}

async function importStorage() {
  const root = join(outDir, 'storage');
  if (!existsSync(root)) { console.warn('  storage/ ausente'); return; }
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const p of walk(root)) {
    const key = relative(root, p).split('\\').join('/');
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encPath(key)}`, {
      method: 'POST', headers: { ...H, 'x-upsert': 'true' }, body: readFileSync(p),
    });
    if (!r.ok) console.error(`  storage ${key}: HTTP ${r.status} ${await r.text()}`);
    else console.log(`  ✓ storage ${key}`);
  }
}

async function main() {
  verifyChecksum();
  extract();

  const tblArg = opt('--import-table');
  const tblName = typeof tblArg === 'string' ? tblArg : null;
  if (tblArg === true) { console.error('❌ --import-table exige o nome da tabela.'); process.exit(1); }
  const wantDb = flag('--import-db') || !!tblName;
  const wantStorage = flag('--import-storage');
  if (!wantDb && !wantStorage) {
    console.log('\nExtração concluída. Para reimportar (DESTRUTIVO), use --import-db / --import-table <nome> / --import-storage com --yes.');
    return;
  }
  if (!flag('--yes')) { console.error('\n⚠️  Operação destrutiva. Reexecute com --yes para confirmar.'); process.exit(1); }
  requireCreds();

  if (tblName) { console.log('Importando tabela:'); await importTable(tblName); }
  else if (flag('--import-db')) {
    console.log('Importando tabelas:');
    for (const t of Object.keys(PK)) await importTable(t);
  }
  if (wantStorage) { console.log('Reenviando documentos:'); await importStorage(); }
  console.log('\n✅ Restauração concluída.');
}

main().catch((e) => { console.error('❌', e.message || e); process.exit(1); });
