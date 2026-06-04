/**
 * main.js — Entry Point do Expatur Backoffice
 *
 * Ordem de inicialização (importa em sequência):
 *  1. storage.js  — intercepção do localStorage + sincronização Supabase
 *  2. app.js      — toda a lógica de negócio (IIFE, extraída do index.html)
 *  3. auth.js     — sobrescreve as funções de auth do app.js com Supabase
 *
 * auth.js corre DEPOIS de app.js porque precisa sobrescrever window.__loginSubmitReal,
 * window._logout e window._checkServerSession que o app.js define.
 */

import './storage.js';
import './app.js';
import './auth.js';
