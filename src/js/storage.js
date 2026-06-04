/**
 * storage.js — Abstração de persistência
 *
 * FASE 1 (agora):  usa localStorage — comportamento idêntico ao original
 * FASE 2 (depois): troca para Supabase sem alterar nenhuma chamada no app.js
 *
 * API pública (espelhada no window para compatibilidade com app.js):
 *   storage.getItem(key)
 *   storage.setItem(key, value)
 *   storage.removeItem(key)
 *   storage.keys()           → todas as chaves expatur_*
 *   storage.getDossier(id)   → objeto JSON ou null
 *   storage.saveDossier(id, data)
 *   storage.listDossiers()   → array
 */

// ─── Configuração Supabase (preencher quando migrar) ─────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const USE_SUPABASE  = !!(SUPABASE_URL && SUPABASE_KEY);

// ─── Driver localStorage ──────────────────────────────────────────────────────
const _ls = {
  getItem(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      // Quota exceeded — purge expired flight caches and retry once
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        _purgeStaleCaches();
        try { localStorage.setItem(key, value); return true; } catch { return false; }
      }
      return false;
    }
  },
  removeItem(key) {
    try { localStorage.removeItem(key); } catch { }
  },
  keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('expatur_')) out.push(k);
    }
    return out;
  }
};

function _purgeStaleCaches() {
  const TTL = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('expatur_flight_')) continue;
    try {
      const e = JSON.parse(localStorage.getItem(k));
      if (now - e.ts > TTL) localStorage.removeItem(k);
    } catch { localStorage.removeItem(k); }
  }
}

// ─── Driver Supabase (stub — implementar na Fase 2) ───────────────────────────
// const _sb = { ... }

// ─── Driver ativo ─────────────────────────────────────────────────────────────
const _driver = _ls; // trocar para _sb quando Supabase estiver configurado

// ─── API pública ──────────────────────────────────────────────────────────────
export const storage = {
  getItem:    (key)        => _driver.getItem(key),
  setItem:    (key, value) => _driver.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)),
  removeItem: (key)        => _driver.removeItem(key),
  keys:       ()           => _driver.keys(),

  // Helpers tipados para dossiers
  getDossier(id) {
    try { return JSON.parse(_driver.getItem(`expatur_dossier_${id}`) || 'null'); } catch { return null; }
  },
  saveDossier(id, data) {
    return _driver.setItem(`expatur_dossier_${id}`, JSON.stringify(data));
  },
  listDossiers() {
    try { return JSON.parse(_driver.getItem('expatur_dossier_list') || '[]'); } catch { return []; }
  },
  saveListDossiers(list) {
    return _driver.setItem('expatur_dossier_list', JSON.stringify(list));
  },

  // Helper para client
  getClient(ref) {
    try { return JSON.parse(_driver.getItem(`expatur_client_${ref}`) || 'null'); } catch { return null; }
  },
  saveClient(ref, data) {
    return _driver.setItem(`expatur_client_${ref}`, JSON.stringify(data));
  },

  // Helper para tasks
  getTasks(ref) {
    try { return JSON.parse(_driver.getItem(`tasks_v2_${ref}`) || '[]'); } catch { return []; }
  },
  saveTasks(ref, tasks) {
    return _driver.setItem(`tasks_v2_${ref}`, JSON.stringify(tasks));
  },
};

// ─── Expõe no window para compatibilidade com app.js ─────────────────────────
// O app.js usa localStorage.setItem(...) diretamente.
// Na Fase 2, trocaremos os ~1031 usos por storage.setItem() de forma gradual.
// Por ora, o window.localStorage nativo é o mesmo que o driver _ls.
window.__storage = storage;
window.__USE_SUPABASE = USE_SUPABASE;

if (USE_SUPABASE) {
  console.info('[storage] Supabase configurado —', SUPABASE_URL);
} else {
  console.info('[storage] Modo localStorage (Supabase não configurado)');
}
