/**
 * migrate-from-php.mjs — Migração ONE-TIME do backend PHP antigo → Supabase
 *
 * O sistema antigo (workspace.expaturtravel.com) guardava todos os dados em
 * /finance/api.php como linhas {id, type, name, data}. Dois "bridges" de eras
 * diferentes usaram vocabulários de tipos distintos — este script entende os
 * dois e converte para as tabelas Supabase do projeto novo.
 *
 * Uso:
 *   # 1. com export já descarregado:
 *   node scripts/migrate-from-php.mjs --file export.json
 *
 *   # 2. descarregando do servidor antigo (pede credenciais via env):
 *   PHP_EMAIL=... PHP_PASSWORD=... node scripts/migrate-from-php.mjs
 *
 * Requer SUPABASE_SERVICE_KEY no .env.local (bypass RLS para upsert em massa).
 * Após a migração bem-sucedida este script não é mais necessário — o projeto
 * não tem nenhuma dependência runtime do PHP.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const path = resolve(__dir, '..', file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv('.env');
loadEnv('.env.local');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY em falta (.env / .env.local)');
  process.exit(1);
}
// REST direto (PostgREST) — evita o supabase-js, que exige WebSocket no Node 20
async function restUpsert(table, rows, onConflict) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) throw new Error(`${table}: HTTP ${resp.status} — ${await resp.text()}`);
}

const OLD_BASE = 'https://workspace.expaturtravel.com';

// ── 1. Obter o dump ───────────────────────────────────────────────────────────
async function getDump() {
  const fileArg = process.argv.indexOf('--file');
  if (fileArg !== -1 && process.argv[fileArg + 1]) {
    console.log('→ A ler export local:', process.argv[fileArg + 1]);
    return JSON.parse(readFileSync(process.argv[fileArg + 1], 'utf8'));
  }
  const email = process.env.PHP_EMAIL, pw = process.env.PHP_PASSWORD;
  if (!email || !pw) {
    console.error('❌ Sem --file e sem PHP_EMAIL/PHP_PASSWORD no ambiente.');
    process.exit(1);
  }
  console.log('→ Login no sistema antigo…');
  const loginResp = await fetch(`${OLD_BASE}/finance/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: pw }).toString(),
    redirect: 'manual',
  });
  const cookies = loginResp.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  if (!cookies) { console.error('❌ Login não devolveu cookies de sessão.'); process.exit(1); }
  console.log('→ A descarregar /finance/api.php…');
  const apiResp = await fetch(`${OLD_BASE}/finance/api.php`, { headers: { Cookie: cookies } });
  if (!apiResp.ok) { console.error('❌ api.php devolveu', apiResp.status); process.exit(1); }
  const rows = await apiResp.json();
  const backup = resolve(__dir, '..', 'legacy', `php-export-${new Date().toISOString().slice(0,10)}.json`);
  writeFileSync(backup, JSON.stringify(rows));
  console.log(`→ Backup guardado em ${backup} (gitignored — contém dados pessoais)`);
  return rows;
}

// ── 2. Transformar ────────────────────────────────────────────────────────────
// Em colisões (mesma chave lógica vinda dos dois bridges) ganha o row com id
// mais alto = escrita mais recente no servidor antigo.
function transform(rows) {
  const dossiers   = new Map();  // id  → {row, data}
  const dossList   = new Map();  // id  → label
  const clients    = new Map();  // ref → {id, data}
  const tasks      = new Map();  // ref → {id, data}
  const clientsDbCandidates = []; // arrays de clientes (bridge1 __blob + bridge2 collection)
  const singleTasks = [];        // tarefas individuais a reagrupar por ref
  const kv         = new Map();  // key → {id, value(string)}

  const SKIP_TYPES = new Set(['availability', 'test', 'clientes', 'vendedor', 'cliente']);
  // 'cliente' (548): items individuais do clients_db do bridge1 — redundantes,
  //   o __blob expatur_clients_db contém a base completa.
  // 'availability': cache de voos com TTL — não migrar.

  const putKv = (key, id, data, scalar = false) => {
    const cur = kv.get(key);
    if (cur && cur.id > id) return;
    const value = scalar
      ? String(data == null ? '' : (typeof data === 'object' ? JSON.stringify(data) : data))
      : JSON.stringify(data);
    kv.set(key, { id, value });
  };

  for (const r of rows) {
    const { id, type, name, data } = r;
    if (data == null || SKIP_TYPES.has(type)) continue;

    switch (type) {
      // ── tabelas dedicadas ──
      case 'dossier': {
        const cur = dossiers.get(name);
        if (!cur || cur.id < id) dossiers.set(name, { id, data });
        break;
      }
      case 'dossier_index':
        if (name === 'main' && Array.isArray(data)) {
          for (const it of data) {
            const did = typeof it === 'string' ? it : it.id;
            if (did) dossList.set(did, (typeof it === 'object' && it.label) || did);
          }
        }
        break; // 'all' = estrutura órfã de versão antiga, ignorada
      case 'client':            // bridge2
      case 'client_dossier': {  // bridge1 — mesma chave expatur_client_<ref>
        const cur = clients.get(name);
        if (!cur || cur.id < id) clients.set(name, { id, data });
        break;
      }
      case 'clients_collection': // bridge2 'main'
      case '__blob':
        if (type === '__blob' && name === 'expatur_clients_db') {
          if (Array.isArray(data)) clientsDbCandidates.push(data);
        } else if (type === '__blob' && name === 'expatur_fornecedores') {
          putKv('expatur_fornecedores', id, data);
        } else if (type === '__blob') {
          putKv(name, id, data); // ex: expatur_cli_files_<id>
        } else if (Array.isArray(data)) {
          clientsDbCandidates.push(data);
        }
        break;
      case 'task':      // bridge2
      case 'taskset': { // bridge1 — mesma chave tasks_v2_<ref>
        if (Array.isArray(data)) {
          const cur = tasks.get(name);
          if (!cur || cur.id < id) tasks.set(name, { id, data });
        } else if (data && typeof data === 'object') {
          // Writer antigo bugado: tarefa INDIVIDUAL gravada com nome mutilado
          // "<ref>_<ref>_<ref>_<taskid>" — extrair o ref real e reagrupar.
          const tok = name.split('_');
          const ref = (tok.length > 1 && tok[0] === tok[1]) ? tok[0] : null;
          if (!ref) { console.warn('  (task individual sem ref detectável):', name); break; }
          singleTasks.push({ ref, task: data });
        }
        break;
      }

      // ── kv_store (chaves de negócio) ──
      case 'booked':          putKv('expatur_booked_' + name, id, data, true); break;
      case 'bookedAt':        putKv('expatur_bookedAt_' + name, id, data, true); break;
      case 'billet':          putKv('expatur_billet_' + name, id, data); break;
      case 'billet_frozen':   putKv('billetFrozen_' + name, id, data, true); break;
      case 'payment':         putKv('expatur_payments_' + name, id, data); break;
      case 'em_state':        putKv('expatur_em_state_' + name, id, data); break;
      case 'em_invoice':      putKv('expatur_em_invoice_' + name, id, data); break;
      case 'pnl':             putKv('expatur_pnl_' + name, id, data); break;
      case 'task_files':      // bridge2
      case 'taskfiles':       putKv('task_files_v1_' + name, id, data); break;
      case 'client_passport': putKv('expatur_cli_passport_' + name, id, data); break;
      case 'fornecedores_collection':    putKv('expatur_fornecedores', id, data); break;
      case 'vendedores_collection':      putKv('expatur_vendedores', id, data); break;
      case 'disponibilidades_collection':putKv('expatur_disponibilidades', id, data); break;
      case 'stripe_fees':                putKv('expatur_stripe_monthly_fees', id, data); break;
      case 'dossiers_import':            putKv('expatur_dossiers', id, data); break;
      case 'financeiro_lancamentos':     putKv('expatur_financeiro_lancamentos', id, data); break;
      case 'finance':
        if (name === 'lancamentos') putKv('expatur_financeiro_lancamentos', id, data);
        else if (name === 'canonical') putKv('fin_v1_entries', id, data);
        break;
      case 'session_state':
        if (name === 'last_devis') putKv('expatur_last_devis', id, data);
        break; // active_dossier é por-dispositivo — não migrar
      default:
        console.warn('  (tipo não mapeado, ignorado):', type, name);
    }
  }
  // Reagrupar tarefas individuais nos arrays tasks_v2_<ref> (dedupe por task.id)
  for (const { ref, task } of singleTasks) {
    const cur = tasks.get(ref) || { id: 0, data: [] };
    if (!cur.data.some(x => String(x.id) === String(task.id))) cur.data.push(task);
    tasks.set(ref, cur);
  }

  // Fundir as bases de clientes: o __blob (bridge1) tem a importação Bitrix24
  // completa (548); a clients_collection (bridge2) tem os criados depois.
  // Dedupe por id e por email.
  let clientsDb = null;
  if (clientsDbCandidates.length) {
    const seen = new Set();
    const merged = [];
    for (const arr of clientsDbCandidates.sort((a, b) => b.length - a.length)) {
      for (const cli of arr) {
        const k1 = cli.id || '';
        const k2 = (cli.email || '').toLowerCase();
        if ((k1 && seen.has('i:' + k1)) || (k2 && seen.has('e:' + k2))) continue;
        if (k1) seen.add('i:' + k1);
        if (k2) seen.add('e:' + k2);
        merged.push(cli);
      }
    }
    clientsDb = { id: 0, data: merged };
  }
  return { dossiers, dossList, clients, tasks, clientsDb, kv };
}

// ── 3. Importar (upsert em lotes) ─────────────────────────────────────────────
async function batchUpsert(table, rows, onConflict) {
  const B = 100;
  let done = 0;
  for (let i = 0; i < rows.length; i += B) {
    await restUpsert(table, rows.slice(i, i + B), onConflict);
    done += Math.min(B, rows.length - i);
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  console.log();
}

const dump = await getDump();
console.log(`→ ${dump.length} linhas no export`);
const t = transform(dump);

console.log(`\n→ A importar para o Supabase:`);
await batchUpsert('dossiers',
  [...t.dossiers].map(([id, v]) => ({ id, data: v.data, label: v.data?._label || null })), 'id');
await batchUpsert('dossier_list',
  [...t.dossList].map(([id, label]) => ({ id, label })), 'id');
await batchUpsert('clients',
  [...t.clients].map(([ref, v]) => ({ ref, data: v.data })), 'ref');
await batchUpsert('tasks',
  [...t.tasks].map(([ref, v]) => ({ ref, data: v.data })), 'ref');
if (t.clientsDb) {
  await restUpsert('clients_db', [{ id: 1, data: t.clientsDb.data }], 'id');
  console.log(`  clients_db: ${Array.isArray(t.clientsDb.data) ? t.clientsDb.data.length : '?'} clientes (registo único)`);
}
await batchUpsert('kv_store',
  [...t.kv].map(([key, v]) => ({ key, value: v.value })), 'key');

console.log(`\n✅ Migração concluída:
  dossiers:     ${t.dossiers.size}
  dossier_list: ${t.dossList.size}
  clients:      ${t.clients.size}
  clients_db:   ${t.clientsDb && Array.isArray(t.clientsDb.data) ? t.clientsDb.data.length : 0} clientes
  tasks:        ${t.tasks.size}
  kv_store:     ${t.kv.size} chaves
`);
