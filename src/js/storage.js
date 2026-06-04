/**
 * storage.js — Camada de persistência com sincronização Supabase
 *
 * Estratégia:
 *   - localStorage é o cache síncrono (app.js lê/escreve aqui sem mudanças)
 *   - Supabase é o backend persistente (multi-utilizador, multi-device)
 *   - No login: hidrata localStorage com dados do Supabase (sbHydrate)
 *   - Em background: escuta writes ao localStorage e sincroniza com Supabase (sbStartSync)
 *
 * Desta forma, o app.js não precisa de nenhuma alteração.
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

// ── Referência ao setItem NATIVO — capturada ANTES de qualquer override ────────
// CRÍTICO: _lsSet e sbStartSync devem usar esta referência para evitar
// recursão infinita quando localStorage.setItem for sobrescrito pelo sync.
const _nativeLsSet    = localStorage.setItem.bind(localStorage);
const _nativeLsRemove = localStorage.removeItem.bind(localStorage);

// ── Purge de caches de voos expirados (evita QuotaExceededError) ──────────────
function _purgeStaleCaches() {
  const TTL = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith('expatur_flight_')) continue;
    try {
      const e = JSON.parse(localStorage.getItem(k));
      if (now - e.ts > TTL) _nativeLsRemove(k);
    } catch { _nativeLsRemove(k); }
  }
}

// ── Guarda de cota para localStorage (usa referência nativa — sem recursão) ───
function _lsSet(key, value) {
  try {
    _nativeLsSet(key, value);   // ← nativo, nunca chama o override
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      _purgeStaleCaches();
      try { _nativeLsSet(key, value); return true; } catch { return false; }
    }
    return false;
  }
}

// ── Chaves que são sincronizadas com Supabase ────────────────────────────────
// Formato: { pattern: RegExp, table: string, getRowId: fn, getPayload: fn }
const SYNC_RULES = [
  {
    // expatur_dossier_{id}  →  dossiers
    test: k => k.startsWith('expatur_dossier_') && !k.includes('_list'),
    table: 'dossiers',
    rowId: k => k.replace('expatur_dossier_', ''),
    payload: (k, v) => {
      const id = k.replace('expatur_dossier_', '');
      try { return { id, data: JSON.parse(v) }; } catch { return { id, data: {} }; }
    },
  },
  {
    // expatur_dossier_list  →  dossier_list (array → rows)
    test: k => k === 'expatur_dossier_list',
    table: null,  // tratado separadamente (array de rows)
    rowId: () => null,
    payload: () => null,
  },
  {
    // expatur_client_{ref}  →  clients
    test: k => k.startsWith('expatur_client_') && k !== 'expatur_clients_db',
    table: 'clients',
    rowId: k => k.replace('expatur_client_', ''),
    payload: (k, v) => {
      const ref = k.replace('expatur_client_', '');
      try { return { ref, data: JSON.parse(v) }; } catch { return { ref, data: {} }; }
    },
  },
  {
    // expatur_clients_db  →  clients_db
    test: k => k === 'expatur_clients_db',
    table: 'clients_db',
    rowId: () => '1',
    payload: (_k, v) => {
      try { return { id: 1, data: JSON.parse(v) }; } catch { return { id: 1, data: [] }; }
    },
  },
  {
    // tasks_v2_{ref}  →  tasks
    test: k => k.startsWith('tasks_v2_'),
    table: 'tasks',
    rowId: k => k.replace('tasks_v2_', ''),
    payload: (k, v) => {
      const ref = k.replace('tasks_v2_', '');
      try { return { ref, data: JSON.parse(v) }; } catch { return { ref, data: [] }; }
    },
  },
];

function _findRule(key) {
  return SYNC_RULES.find(r => r.test(key)) || null;
}

// ── Debounce por chave para não sobrecarregar o Supabase em cada keystroke ────
const _debounceTimers = {};
function _debouncedUpsert(key, value, delay = 1500) {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(() => _upsertToSupabase(key, value), delay);
}

async function _upsertToSupabase(key, value) {
  if (!SUPABASE_ENABLED || !supabase) return;

  // Caso especial: dossier_list
  if (key === 'expatur_dossier_list') {
    try {
      const list = JSON.parse(value || '[]');
      if (!Array.isArray(list) || !list.length) return;
      const rows = list.map(item => ({
        id:    typeof item === 'string' ? item : item.id,
        label: typeof item === 'object' ? (item.label || item.id) : item,
      }));
      await supabase.from('dossier_list').upsert(rows, { onConflict: 'id' });
    } catch (e) {
      console.warn('[storage] dossier_list sync error', e);
    }
    return;
  }

  const rule = _findRule(key);
  if (!rule || !rule.table) return;

  try {
    const payload = rule.payload(key, value);
    if (!payload) return;
    await supabase.from(rule.table).upsert(payload, {
      onConflict: rule.table === 'clients_db' ? 'id' : (rule.table === 'tasks' || rule.table === 'clients' ? 'ref' : 'id'),
    });
  } catch (e) {
    console.warn(`[storage] sync error for ${key}:`, e.message);
  }
}

// ── sbHydrate: carrega dados do Supabase → localStorage (chamado no login) ───
export async function sbHydrate() {
  if (!SUPABASE_ENABLED || !supabase) return;

  console.info('[storage] Hidratando localStorage com dados do Supabase…');

  try {
    // Dossiers
    const { data: dossiers } = await supabase.from('dossiers').select('id, data');
    dossiers?.forEach(d => {
      if (d.data) _lsSet(`expatur_dossier_${d.id}`, JSON.stringify(d.data));
    });

    // Dossier list
    const { data: list } = await supabase.from('dossier_list').select('id, label');
    if (list?.length) {
      _lsSet('expatur_dossier_list', JSON.stringify(list.map(r => ({ id: r.id, label: r.label }))));
    }

    // Clients
    const { data: clients } = await supabase.from('clients').select('ref, data');
    clients?.forEach(c => {
      if (c.data) _lsSet(`expatur_client_${c.ref}`, JSON.stringify(c.data));
    });

    // Clients DB
    const { data: cdb } = await supabase.from('clients_db').select('data').eq('id', 1).single();
    if (cdb?.data) _lsSet('expatur_clients_db', JSON.stringify(cdb.data));

    // Tasks
    const { data: tasks } = await supabase.from('tasks').select('ref, data');
    tasks?.forEach(t => {
      if (t.data) _lsSet(`tasks_v2_${t.ref}`, JSON.stringify(t.data));
    });

    console.info('[storage] Hidratação concluída.');
  } catch (e) {
    console.warn('[storage] Erro na hidratação:', e.message);
  }
}

// ── sbStartSync: intercepta localStorage.setItem para sincronizar em background
let _syncActive = false;

export function sbStartSync() {
  if (!SUPABASE_ENABLED || !supabase || _syncActive) return;
  _syncActive = true;

  // Override setItem — usa _nativeLsSet para evitar recursão infinita
  // (_lsSet também usa _nativeLsSet, mas sendo explícito aqui por clareza)
  localStorage.setItem = function(key, value) {
    // 1. Escreve no localStorage via referência nativa (sem recursão)
    _lsSet(key, value);

    // 2. Sincroniza com Supabase em background (com debounce)
    if (_findRule(key)) {
      _debouncedUpsert(key, value);
    }
  };

  // Override removeItem (para dossiers apagados)
  localStorage.removeItem = function(key) {
    _nativeLsRemove(key);

    if (!SUPABASE_ENABLED || !supabase) return;
    const rule = _findRule(key);
    if (!rule || !rule.table) return;
    const rowId = rule.rowId(key);
    if (!rowId) return;

    // Deleta no Supabase em background
    const pkCol = rule.table === 'tasks' || rule.table === 'clients' ? 'ref' : 'id';
    supabase.from(rule.table).delete().eq(pkCol, rowId).then().catch(() => {});
  };

  console.info('[storage] Sincronização em background activa.');
}

// ── API pública (usada por auth.js e outros módulos) ─────────────────────────
export const storage = {
  getItem:    k       => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem:    (k, v)  => _lsSet(k, typeof v === 'string' ? v : JSON.stringify(v)),
  removeItem: k       => { try { localStorage.removeItem(k); } catch {} },

  getDossier: id  => { try { return JSON.parse(localStorage.getItem(`expatur_dossier_${id}`) || 'null'); } catch { return null; } },
  saveDossier:(id, d) => _lsSet(`expatur_dossier_${id}`, JSON.stringify(d)),
  listDossiers:   () => { try { return JSON.parse(localStorage.getItem('expatur_dossier_list') || '[]'); } catch { return []; } },

  getClient:  ref => { try { return JSON.parse(localStorage.getItem(`expatur_client_${ref}`) || 'null'); } catch { return null; } },
  saveClient: (ref, d) => _lsSet(`expatur_client_${ref}`, JSON.stringify(d)),

  getTasks:  ref  => { try { return JSON.parse(localStorage.getItem(`tasks_v2_${ref}`) || '[]'); } catch { return []; } },
  saveTasks: (ref, t) => _lsSet(`tasks_v2_${ref}`, JSON.stringify(t)),
};

// Expõe no window
window.__storage = storage;
window.__SUPABASE_ENABLED = SUPABASE_ENABLED;

console.info(SUPABASE_ENABLED
  ? '[storage] Supabase activado — sincronização em background após login.'
  : '[storage] Modo localStorage (Supabase não configurado).'
);
