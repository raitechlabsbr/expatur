/**
 * setup-users.mjs — Cria utilizadores admin e agent no Supabase
 *
 * Uso:
 *   SUPABASE_SERVICE_KEY=<service_role_key> node scripts/setup-users.mjs
 *
 * Ou com a chave no .env.local:
 *   node scripts/setup-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Carrega variáveis de ambiente ─────────────────────────────────────────────
function loadEnv(file) {
  const path = resolve(__dir, '..', file);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnv('.env');
loadEnv('.env.local');

const SUPABASE_URL        = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`
❌ Variáveis em falta.

Adicione ao ficheiro .env.local (não é commitado):
  SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...

A service_role key está em:
  Supabase Dashboard → Settings → API → "service_role" (secret)
`);
  process.exit(1);
}

// ── Cliente admin (bypass RLS) ────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Utilizadores a criar ──────────────────────────────────────────────────────
const USERS = [
  {
    // Nível superior (admin) — gerencia permissões/atribuição e lê o Journal.
    email:    'admin@expatur.com.br',
    password: '123123',
    role:     'admin',
    name:     'Admin Expatur',
  },
  {
    email:    'agent@expatur.com.br',
    password: '123123',
    role:     'agent',
    name:     'Agent Expatur',
  },
];

// ── Criar utilizadores ────────────────────────────────────────────────────────
async function createUser({ email, password, role, name }) {
  console.log(`\n👤 A criar: ${email} [${role}]`);

  // 1. Criar na auth (confirma email automaticamente com email_confirm: false)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // confirma sem enviar email
    user_metadata: { role, full_name: name },
  });

  if (error) {
    if (error.message.includes('already been registered') || error.message.includes('already exists')) {
      console.log(`  ℹ️  Utilizador já existe — a actualizar role...`);
      // Obtém o ID do utilizador existente
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find(u => u.email === email);
      if (existing) {
        await updateProfile(existing.id, email, role, name);
        console.log(`  ✓ Role actualizado para '${role}'`);
      }
      return;
    }
    throw new Error(`Auth error: ${error.message}`);
  }

  const userId = data.user.id;
  console.log(`  ✓ Utilizador criado: ${userId}`);

  // 2. Upsert no profiles (o trigger também faz isto, mas garantimos o role)
  await updateProfile(userId, email, role, name);
  console.log(`  ✓ Perfil: role='${role}', email='${email}'`);
}

async function updateProfile(userId, email, role, name) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, role, full_name: name }, {
      onConflict: 'id',
    });
  if (error) console.warn(`  ⚠️  Profile upsert: ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('🚀 Expatur — Setup de Utilizadores');
console.log(`   Projecto: ${SUPABASE_URL}`);

try {
  for (const user of USERS) {
    await createUser(user);
  }

  console.log('\n✅ Utilizadores criados com sucesso!\n');
  console.log('┌─────────────────────────────┬──────────┬──────────┐');
  console.log('│ Email                       │ Password │ Role     │');
  console.log('├─────────────────────────────┼──────────┼──────────┤');
  for (const u of USERS) {
    const email = u.email.padEnd(27);
    const role  = u.role.padEnd(8);
    console.log(`│ ${email} │ ${u.password}   │ ${role} │`);
  }
  console.log('└─────────────────────────────┴──────────┴──────────┘');
  console.log('\n⚠️  Lembre-se de apagar o SUPABASE_SERVICE_KEY do .env.local após este setup.\n');

} catch (e) {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
}
