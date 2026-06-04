/**
 * supabase-client.js — Singleton do cliente Supabase
 *
 * Importado por auth.js e storage.js.
 * Retorna null se as variáveis de ambiente não estiverem configuradas.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
export const SUPABASE_ENABLED = !!(url && key);
