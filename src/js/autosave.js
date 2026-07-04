/**
 * autosave.js — Auto-save global + indicador (spec 2.x — Fase 4)
 *
 * - Save automático contínuo por campo em todos os estágios do deal (2.1/2.2):
 *   debounce 800ms para texto livre; imediato no change de select/checkbox/
 *   radio/date. Cobre os painéis do Ticketing (Itinéraire, Client,
 *   Tarification, Paiement, Tickets, Documents, Finance) e os modais de
 *   billet/emissão. O save na troca de aba (v3.32) continua como rede de
 *   segurança.
 * - Indicador visual fixo "Enregistrement… / Enregistré / Erreur" (2.1),
 *   traduzido para PT pelo i18n (Salvando… / Salvo / Erro ao salvar).
 * - Falha de sync com o Supabase (evento 'expatur-sync-status' do storage.js)
 *   alerta o usuário e mantém o indicador em erro até a recuperação; os dados
 *   permanecem no localStorage e são re-tentados (2.3) — sem perda silenciosa.
 *
 * Nota: um autosave por keystroke já foi revertido no passado por lag
 * ("white-screen") — por isso o flush é debounced, roda no máximo 1×/800ms e
 * o saveBilletData é chamado em modo silencioso (sem toast) e apenas quando o
 * campo editado pertence ao painel/modal de billet.
 */

const DEBOUNCE_TEXT_MS = 800;

// Containers cujos campos disparam auto-save do deal ativo
const SCOPES = ['#section-quoting', '#billet-overlay', '#emission-modal'];

let _timer = null;
let _billetDirty = false;
let _state = 'idle';
let _hideTimer = null;
let _lastErrToast = 0;

/* ── Indicador ───────────────────────────────────────────────────────────── */
function _injectCss() {
  const css = document.createElement('style');
  css.textContent = `
#autosave-indicator { position:fixed; right:14px; bottom:14px; z-index:480;
  display:none; align-items:center; gap:7px; padding:7px 13px; border-radius:999px;
  font:600 12px/1 'Outfit',sans-serif; box-shadow:0 4px 16px rgba(6,32,59,0.18);
  background:#fff; color:var(--navy,#06203B); border:1px solid rgba(6,32,59,0.12);
  pointer-events:none; transition:opacity .25s ease; opacity:0; }
#autosave-indicator.visible { display:inline-flex; opacity:1; }
#autosave-indicator .asi-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
#autosave-indicator.saving .asi-dot { background:#f59e0b; animation:asiPulse 1s ease-in-out infinite; }
#autosave-indicator.saved  .asi-dot { background:#22c55e; }
#autosave-indicator.error  { border-color:rgba(220,38,38,0.4); color:#b91c1c; }
#autosave-indicator.error .asi-dot { background:#dc2626; animation:asiPulse 1s ease-in-out infinite; }
@keyframes asiPulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }`;
  document.head.appendChild(css);
}

function _ensureIndicator() {
  let el = document.getElementById('autosave-indicator');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'autosave-indicator';
  el.innerHTML = '<span class="asi-dot"></span><span class="asi-label"></span>';
  document.body.appendChild(el);
  return el;
}

function _setState(state, message) {
  _state = state;
  const el = _ensureIndicator();
  const label = el.querySelector('.asi-label');
  clearTimeout(_hideTimer);
  el.classList.remove('saving', 'saved', 'error');
  if (state === 'idle') { el.classList.remove('visible'); return; }
  el.classList.add(state, 'visible');
  if (state === 'saving') label.textContent = 'Enregistrement…';
  else if (state === 'saved') {
    label.textContent = 'Enregistré';
    _hideTimer = setTimeout(() => { if (_state === 'saved') _setState('idle'); }, 1800);
  } else if (state === 'error') {
    label.textContent = 'Erreur d’enregistrement' + (message ? ' — ' + message : '');
  }
}

/* ── Save do deal ativo ──────────────────────────────────────────────────── */
function _silently(fn) {
  const t = window.toast;
  window.toast = function () {};
  try { fn(); } finally { window.toast = t; }
}

function _flush() {
  _timer = null;
  const id = (() => { try { return localStorage.getItem('expatur_active_dossier'); } catch (e) { return null; } })();
  if (!id) { _setState('idle'); return; }
  try {
    if (typeof window._dossierSave === 'function') window._dossierSave(id);
    if (_billetDirty && typeof window.saveBilletData === 'function') {
      _silently(() => window.saveBilletData());
    }
    _billetDirty = false;
    _setState('saved');
  } catch (e) {
    console.warn('[autosave] save local falhou:', e);
    _setState('error', '');
    if (typeof window.toast === 'function') window.toast('Erreur d’enregistrement — vos données restent dans ce navigateur', 'error');
  }
}

function _queue(delay) {
  _setState('saving');
  clearTimeout(_timer);
  _timer = setTimeout(_flush, delay);
}

/* ── Listeners delegados ─────────────────────────────────────────────────── */
function _scopeOf(el) {
  for (const sel of SCOPES) {
    const host = el.closest && el.closest(sel);
    if (host) return sel;
  }
  return null;
}

function _isField(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return el.type !== 'button' && el.type !== 'submit' && el.type !== 'file';
}

// select/checkbox/radio/date/time → save imediato; texto livre → debounce
function _isImmediate(el) {
  if (el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  return ['checkbox', 'radio', 'date', 'time', 'datetime-local', 'month'].includes(el.type);
}

function _onInput(ev) {
  const el = ev.target;
  if (!_isField(el) || _isImmediate(el)) return;
  const scope = _scopeOf(el);
  if (!scope) return;
  if (scope !== '#section-quoting') _billetDirty = true;
  if (el.closest && el.closest('#dv-panel-billet')) _billetDirty = true;
  _queue(DEBOUNCE_TEXT_MS);
}

function _onChange(ev) {
  const el = ev.target;
  if (!_isField(el)) return;
  const scope = _scopeOf(el);
  if (!scope) return;
  if (scope !== '#section-quoting' || (el.closest && el.closest('#dv-panel-billet'))) _billetDirty = true;
  _queue(_isImmediate(el) ? 0 : 250);
}

/* ── Estado do sync Supabase (2.3) ───────────────────────────────────────── */
function _onSyncStatus(ev) {
  const d = (ev && ev.detail) || {};
  if (d.ok) {
    // recuperou: limpa o estado de erro assim que não há mais pendências
    if (_state === 'error' && !d.pending) _setState('saved');
    return;
  }
  _setState('error', '');
  const now = Date.now();
  if (now - _lastErrToast > 30000) {
    _lastErrToast = now;
    if (typeof window.toast === 'function') {
      window.toast('Échec de synchronisation avec le serveur — données conservées localement, nouvelle tentative automatique', 'error');
    }
  }
}

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
function _init() {
  _injectCss();
  document.addEventListener('input', _onInput, true);
  document.addEventListener('change', _onChange, true);
  window.addEventListener('expatur-sync-status', _onSyncStatus);
  // flush imediato ao sair da página (mantém o save-on-tab-switch existente)
  window.addEventListener('beforeunload', () => { if (_timer) { clearTimeout(_timer); _flush(); } });
  console.info('[autosave] Auto-save por campo activo (debounce ' + DEBOUNCE_TEXT_MS + 'ms + indicador).');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();
