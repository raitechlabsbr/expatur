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
    if (!_supabaseResolved) return;
    if (_currentSession)   return;
    _restoreLoginCard();
    if (typeof _origShowLogin === 'function') _origShowLogin.call(this);
  };
}

// 3. GUARDA PERMANENTE: MutationObserver no #login-overlay
//
//    PROBLEMA RAIZ: pm2 serve --spa retorna HTTP 200 para /finance/api.php.
//    O app.js chama _hideLoginOverlay() (função LOCAL, ignora window.xxx) que:
//      a) adiciona classe 'hidden' → overlay escondido imediatamente
//      b) setTimeout 420ms → overlay.style.display='none' (segunda ocultação)
//
//    O guard corre PERMANENTEMENTE e verifica _currentSession:
//      - _currentSession = null  → overlay NUNCA pode ser escondido (mantém login)
//      - _currentSession = set   → overlay PODE ser escondido (utilizador autenticado)
//
//    SEM disconnect() pois o setTimeout de 420ms dispararia depois de parar o guard.
if (SUPABASE_ENABLED && _loginOverlay) {
  const _overlayGuard = new MutationObserver(function() {
    // Só reverte se Supabase ainda não confirmou sessão válida
    if (_supabaseResolved && _currentSession) return;

    const isHidden = _loginOverlay.classList.contains('hidden')
                   || _loginOverlay.style.display === 'none'
                   || _loginOverlay.style.visibility === 'hidden';
    if (isHidden) {
      _loginOverlay.classList.remove('hidden');
      _loginOverlay.style.display = 'flex';
      _loginOverlay.style.removeProperty('visibility');
      _restoreLoginCard(); // garantir que o card é visível
    }
  });
  _overlayGuard.observe(_loginOverlay, {
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  // NÃO desligar o guard — o setTimeout de 420ms em _hideLoginOverlay
  // dispararia depois e re-esconderia o overlay se desligassemos aqui.
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

// Expõe applyRoleUI para que ui-fixes.js possa re-aplicar quando necessário
window._applyRoleUI = function() {
  applyRoleUI(_currentRole);
};

// ── Bypass do gate de senha do Financeiro para admin ─────────────────────────
// Abordagem definitiva: MutationObserver no #fin-pw-overlay
// Assim que o overlay abre (classe 'open' adicionada), se o utilizador for admin:
//   1. Remove a classe 'open' imediatamente (fecha o modal)
//   2. Marca _finAccessTs = agora (4h de acesso livre)
//   3. Chama sidebarGo('financeiro') para completar a navegação
//
// Isto funciona independentemente de quantos wrappers sidebarGo tenha.
function _installFinGateBypass() {
  const ov = document.getElementById('fin-pw-overlay');
  if (!ov || ov._adminBypassObserver) return;

  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      if (!ov.classList.contains('open')) return;
      if (_currentRole !== 'admin') return;

      // Admin: fechar imediatamente e marcar como desbloqueado
      ov.classList.remove('open');
      try { localStorage.setItem('_finAccessTs', String(Date.now())); } catch(_) {}

      // Completar a navegação para Financeiro (que foi bloqueada pelo gate)
      setTimeout(function() {
        // Chamar _orig ou directamente a lógica de navegação
        if (typeof window._currentSection !== 'undefined') {
          window._currentSection = 'financeiro';
        }
        // Mostrar secção Financeiro directamente
        document.querySelectorAll('.section-page').forEach(function(el) {
          el.classList.remove('open');
        });
        const finSection = document.getElementById('section-financeiro');
        if (finSection) finSection.classList.add('open');
        // Actualizar sidebar active state
        document.querySelectorAll('.sidebar-item').forEach(function(b) {
          b.classList.remove('active');
        });
        const finBtn = document.getElementById('snav-financeiro');
        if (finBtn) finBtn.classList.add('active');
        // Fechar sidebar mobile
        if (typeof window.sidebarClose === 'function') window.sidebarClose();
      }, 10);
    });
  });

  observer.observe(ov, { attributes: true, attributeFilter: ['class'] });
  ov._adminBypassObserver = true;
}

// Instalar logo que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _installFinGateBypass);
} else {
  _installFinGateBypass();
  // Safety net para caso o overlay seja criado mais tarde
  setTimeout(_installFinGateBypass, 800);
}

// ── Obter role do perfil ──────────────────────────────────────────────────────
async function fetchRole(userId) {
  // 1. Verificar user_metadata.role (disponível imediatamente no JWT, sem DB query)
  //    Definido quando o utilizador foi criado: user_metadata: {role: 'admin'}
  const sessionObj = _currentSession?.user || _currentSession;
  const metaRole = sessionObj?.user_metadata?.role;
  if (metaRole === 'admin' || metaRole === 'agent') {
    console.info('[auth] role from user_metadata:', metaRole);
    return metaRole;
  }

  // 2. Fallback: consultar a tabela profiles (requer sessão Supabase activa)
  if (!supabase) return 'agent';
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) {
      console.warn('[auth] profiles query error:', error.message);
      return 'agent';
    }
    console.info('[auth] role from profiles table:', data?.role);
    return data?.role || 'agent';
  } catch (e) {
    console.warn('[auth] fetchRole exception:', e.message);
    return 'agent';
  }
}

// ── Aplicar sessão ────────────────────────────────────────────────────────────
// Aceita tanto o objeto session do SDK ({ user, access_token })
// como a resposta directa da REST API ({ user, access_token, refresh_token })
async function applySession(session) {
  if (!session) {
    _currentSession = null;
    _currentRole    = 'agent';
    window.__serverSession = { authenticated: false, isAdmin: false };
    _supabaseResolved = true;
    _showLogin();
    return;
  }

  // Normalizar: SDK devolve session.user, REST devolve session.user directamente
  const user = session.user || session;
  if (!user || !user.id) {
    console.warn('[auth] applySession: sem user.id na sessão', session);
    _supabaseResolved = true;
    _showLogin();
    return;
  }

  _currentSession = session;
  _currentRole    = await fetchRole(user.id);

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
    // ── Usa fetch() directamente (mesmo protocolo que curl — sem overhead do SDK) ──
    const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: {
        'apikey':       SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password: pw }),
    });

    const body = await resp.json();
    console.log('[auth] login resp status:', resp.status, '| ok:', resp.ok);

    if (!resp.ok || body.error) {
      const msg = body.error_description || body.error || body.message || `HTTP ${resp.status}`;
      console.error('[auth] login erro:', msg, body);
      if (errEl) {
        errEl.textContent = /Invalid login|invalid credentials/i.test(msg)
          ? '❌ Identifiants invalides — vérifiez votre email et mot de passe.'
          : '⚠️ ' + msg;
        errEl.style.display = 'block';
      }
      if (pwEl) { pwEl.value = ''; pwEl.focus(); }
      return;
    }

    // Entrega a sessão ao SDK do Supabase para ele gerir o refresh token
    if (supabase && body.access_token) {
      await supabase.auth.setSession({
        access_token:  body.access_token,
        refresh_token: body.refresh_token,
      });
    }
    await applySession(body);

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
  // 1. Sinalizar logout imediatamente (antes de qualquer async)
  _currentSession   = null;
  _supabaseResolved = false;
  window.__serverSession = { authenticated: false, isAdmin: false };

  // 2. Signout no Supabase (invalida o token no servidor)
  if (supabase) {
    try { await supabase.auth.signOut(); } catch(e) {}
  }

  // 3. Limpar TODOS os tokens Supabase do localStorage manualmente
  //    (garante que getSession() retorna null na próxima carga)
  try {
    Object.keys(localStorage).forEach(function(k) {
      if (k.startsWith('sb-') || k.includes('supabase') || k.includes('-auth-token')) {
        localStorage.removeItem(k);
      }
    });
  } catch(e) {}

  // 4. Recarregar página
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
