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
 *  4. ui-fixes.js — listeners dinâmicos em falta (price inputs → buildPreview)
 */

import './storage.js';
import './app.js';
import './auth.js';
import './ui-fixes.js';
import { initI18n, currentLang } from './i18n.js';
import './task-import.js';
import './programs.js';
import './deal-status.js';
import './autosave.js';
import './documents.js';
import './permissions.js';
import './system-log.js';
import './dashboard.js';
import './tasks-kanban.js';
import './merge-segments.js';
import './client-picker.js';
import './vols.js';
import './comms.js';
import './recap.js';
import './dxr.js';

// Inicializar i18n (aplica língua guardada + inicia MutationObserver se PT)
initI18n();

// Sincronizar estado visual do selector com a língua guardada
(function syncLangSelector() {
  function _sync() {
    document.querySelectorAll('.lang-selector-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _sync);
  } else {
    _sync();
  }
})();
