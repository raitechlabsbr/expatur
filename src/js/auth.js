/**
 * auth.js — Autenticação Supabase
 *
 * Substitui o sistema PHP (/finance/login.php) por Supabase Auth.
 * Carregado DEPOIS de app.js para sobrescrever as funções de auth.
 *
 * Roles:
 *   agent → acesso a tudo EXCETO Finance (Ticketing) e Financeiro (sidebar)
 *   admin → acesso total + gestão de utilizadores
 *
 * Fix de race condition (hard refresh):
 *   app.js startup chama a função PHP _checkServerSession() local que
 *   retorna {authenticated:false} e chama _showLoginOverlay(). Intercep-
 *   tamos window._showLoginOverlay sincronamente antes disso acontecer,
 *   para que só o Supabase controle quando o overlay é mostrado.
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';
import { sbHydrate, sbStartSync } from './storage.js';

// ══════════════════════════════════════════════════════════════════════════════
// SECÇÃO SÍNCRONA — corre ANTES de qualquer código async
// Garante que o overlay de login não pisca por causa da chamada PHP
// ══════════════════════════════════════════════════════════════════════════════

let _supabaseResolved = false;  // true depois de supabase.auth.getSession() terminar
let _currentSession   = null;
let _currentRole      = 'agent';

// 1. Oculta o overlay imediatamente com uma classe de loading
//    (evita o flash do formulário de login enquanto o Supabase verifica)
const _loginOverlay = document.getElementById('login-overlay');
if (_loginOverlay && SUPABASE_ENABLED) {
  _loginOverlay.setAttribute('data-auth-loading', 'true');
  // Aplica estilos de loading inline para não depender de CSS externo
  _loginOverlay.style.background = 'rgba(255,255,255,1)';
  _loginOverlay.style.display    = 'flex';
  // Esconde o card do login durante o check — só mostra se não autenticado
  const _loginCard = _loginOverlay.querySelector('.login-card');
  if (_loginCard) _loginCard.style.visibility = 'hidden';
}

// 2. Intercepta window._showLoginOverlay para bloquear chamadas do app.js PHP
//    enquanto o Supabase ainda não respondeu, ou se já há sessão válida
const _origShowLogin = window._showLoginOverlay;
if (SUPABASE_ENABLED) {
  window._showLoginOverlay = function() {
    if (!_supabaseResolved) return;  // Supabase ainda a verificar — ignorar
    if (_currentSession)   return;  // Supabase confirmou sessão — não mostrar
    // Sem sessão Supabase → mostrar login real
    _restoreLoginCard();
    if (typeof _origShowLogin === 'function') _origShowLogin.call(this);
  };
}

function _restoreLoginCard() {
  if (!_loginOverlay) return;
  _loginOverlay.removeAttribute('data-auth-loading');
  _loginOverlay.style.background = '';
  const _loginCard = _loginOverlay.querySelector('.login-card');
  if (_loginCard) _loginCard.style.visibility = '';
}

// ══════════════════════════════════════════════════════════════════════════════
// SECÇÃO ASSÍNCRONA
// ══════════════════════════════════════════════════════════════════════════════

function _hideLogin() {
  if (_loginOverlay) {
    _loginOverlay.style.display = 'none';
    _loginOverlay.classList.add('hidden');
    _restoreLoginCard();
  }
  if (typeof window._hideLoginOverlay === 'function') window._hideLoginOverlay();
}

function _showLogin() {
  _restoreLoginCard();
  if (typeof _origShowLogin === 'function') _origShowLogin();
  else if (_loginOverlay) { _loginOverlay.classList.remove('hidden'); _loginOverlay.style.display = 'flex'; }
}

function _updateAdmin() {
  if (typeof window._updateAdminVisibility === 'function') window._updateAdminVisibility();
}

// ── Visibilidade por role ─────────────────────────────────────────────────────
function applyRoleUI(role) {
  const isAdmin = role === 'admin';

  // Finance tab dentro do Ticketing — só admin
  ['qt-tab-finance', 'dv-panel-finance'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });

  // Financeiro na sidebar e section-page — só admin
  ['snav-financeiro', 'section-financeiro'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });

  // Admin sidebar — já controlado por _updateAdminVisibility, mas reforçamos
  const adminLabel = document.getElementById('sidebar-admin-label');
  const adminItem  = document.getElementById('snav-admin-users');
  if (adminLabel) adminLabel.style.display = isAdmin ? 'block' : 'none';
  if (adminItem)  adminItem.style.display  = isAdmin ? 'flex'  : 'none';
}

// ── Obter role do perfil ──────────────────────────────────────────────────────
async function fetchRole(userId) {
  if (!supabase) return 'agent';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    return data?.role || 'agent';
  } catch {
    return 'agent';
  }
}

// ── Aplicar sessão ────────────────────────────────────────────────────────────
async function applySession(session) {
  if (!session) {
    _currentSession = null;
    _currentRole    = 'agent';
    window.__serverSession = { authenticated: false, isAdmin: false };
    _supabaseResolved = true;
    _showLogin();
    return;
  }

  _currentSession = session;
  _currentRole    = await fetchRole(session.user.id);

  const isAdmin = _currentRole === 'admin';
  window.__serverSession = { authenticated: true, isAdmin };
  _supabaseResolved = true;

  await sbHydrate();
  sbStartSync();

  _hideLogin();
  _updateAdmin();
  applyRoleUI(_currentRole);
  if (typeof window.__hydrate === 'function') setTimeout(window.__hydrate, 150);
}

// ── Override: login ───────────────────────────────────────────────────────────
// app.js linha 298 faz: window._loginSubmit = __loginSubmitReal (cópia directa da fn PHP)
// Isso significa que mesmo overridando __loginSubmitReal, o _loginSubmit ainda aponta para PHP.
// Fix: substituir TAMBÉM window._loginSubmit para chamar a nossa versão dinamicamente.
window._loginSubmit = function() {
  if (typeof window.__loginSubmitReal === 'function') {
    window.__loginSubmitReal();
  }
};

window.__loginSubmitReal = async function() {
  if (!SUPABASE_ENABLED) {
    const errEl = document.getElementById('login-error');
    if (errEl) { errEl.textContent = '⚠️ Supabase não configurado. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env'; errEl.style.display = 'block'; }
    return;
  }

  const emailEl = document.getElementById('login-email-input');
  const pwEl    = document.getElementById('login-pw-input');
  const errEl   = document.getElementById('login-error');
  const btnEl   = document.querySelector('.login-btn');

  const email = emailEl?.value.trim() || '';
  const pw    = pwEl?.value || '';

  if (!email || !pw) {
    if (errEl) { errEl.textContent = 'Veuillez entrer votre email et votre mot de passe.'; errEl.style.display = 'block'; }
    return;
  }

  if (btnEl)  { btnEl.disabled = true; btnEl.textContent = 'Connexion…'; }
  if (errEl)  { errEl.style.display = 'none'; errEl.textContent = ''; }

  try {
    console.log('[auth] Tentando login:', email, '| supabase URL:', supabase.supabaseUrl);
    console.log('[auth] SUPABASE_ENABLED:', SUPABASE_ENABLED, '| supabase obj:', !!supabase);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });

    if (error) {
      // Log completo para diagnóstico
      console.error('[auth] signInWithPassword ERRO completo:', JSON.stringify({
        message: error.message,
        status:  error.status,
        code:    error.code,
        name:    error.name,
      }));
      if (errEl) {
        // Em dev: mostra o erro real
        errEl.textContent = `⚠️ ${error.message} [status:${error.status || '?'} code:${error.code || '?'}]`;
        errEl.style.display = 'block';
      }
      if (pwEl) { pwEl.value = ''; pwEl.focus(); }
      return;
    }

    await applySession(data.session);

  } catch (e) {
    if (errEl) {
      errEl.textContent = '⚠️ Erreur réseau — ' + (e.message || 'impossible de joindre Supabase');
      errEl.style.display = 'block';
    }
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Connexion sécurisée →'; }
  }
};

// ── Override: logout ──────────────────────────────────────────────────────────
window._logout = async function() {
  if (supabase) await supabase.auth.signOut().catch(() => {});
  _currentSession  = null;
  _supabaseResolved = false;
  window.__serverSession = { authenticated: false, isAdmin: false };
  location.reload();
};

// ── Override: verificação de sessão ──────────────────────────────────────────
window._checkServerSession = async function() {
  if (!SUPABASE_ENABLED) return { authenticated: false, isAdmin: false };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { authenticated: false, isAdmin: false };
    const role = await fetchRole(session.user.id);
    return { authenticated: true, isAdmin: role === 'admin' };
  } catch {
    return { authenticated: false, isAdmin: false };
  }
};

// ── Inicialização ─────────────────────────────────────────────────────────────
async function init() {
  if (!SUPABASE_ENABLED) {
    // Sem Supabase: liberta o overlay para que o app.js use o fluxo PHP normal
    _supabaseResolved = true;
    window._showLoginOverlay = _origShowLogin;
    _restoreLoginCard();
    console.warn('[auth] Supabase não configurado — usando fluxo PHP.');
    return;
  }

  // Escuta mudanças de sessão (ex: token expirado, logout noutro tab)
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (_supabaseResolved) {
      // Só trata mudanças DEPOIS do check inicial (evita double-trigger)
      await applySession(session);
    }
  });

  // Verifica sessão existente (lê do localStorage — muito rápido)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await applySession(session);
  } catch (e) {
    console.warn('[auth] Erro ao verificar sessão:', e.message);
    _supabaseResolved = true;
    _restoreLoginCard();
    _showLogin();
  }
}

// Corre imediatamente (o módulo é importado após o DOM estar pronto)
init();

// ── Exports públicos ──────────────────────────────────────────────────────────
export function getCurrentRole()    { return _currentRole;    }
export function getCurrentSession() { return _currentSession; }
