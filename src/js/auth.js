/**
 * auth.js — Autenticação Supabase
 *
 * Substitui o sistema PHP (/finance/login.php) por Supabase Auth.
 * Carregado DEPOIS de app.js para sobrescrever as funções de auth
 * que o app.js definiu.
 *
 * Roles:
 *   agent → acesso a tudo EXCETO Finance (Ticketing) e Financeiro (sidebar)
 *   admin → acesso total + gestão de utilizadores
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';
import { sbHydrate, sbStartSync } from './storage.js';

// ── Guarda a sessão ativa ─────────────────────────────────────────────────────
let _currentSession = null;
let _currentRole    = 'agent';

// ── Helpers de UI (chamadas ao app.js que corre no IIFE global) ───────────────
function _hideLogin()  { if (typeof window._hideLoginOverlay  === 'function') window._hideLoginOverlay();  }
function _showLogin()  { if (typeof window._showLoginOverlay  === 'function') window._showLoginOverlay();  }
function _updateAdmin(){ if (typeof window._updateAdminVisibility === 'function') window._updateAdminVisibility(); }

// ── Visibilidade baseada em role ──────────────────────────────────────────────
function applyRoleUI(role) {
  const isAdmin = role === 'admin';

  // Finance tab dentro do Ticketing — só admin
  const finTab   = document.getElementById('qt-tab-finance');
  const finPanel = document.getElementById('dv-panel-finance');
  if (finTab)   finTab.style.display   = isAdmin ? '' : 'none';
  if (finPanel) finPanel.style.display = isAdmin ? '' : 'none';

  // Financeiro na sidebar — só admin
  const snavFin = document.getElementById('snav-financeiro');
  if (snavFin) snavFin.style.display = isAdmin ? '' : 'none';

  // Secção Financeiro (section-page) — só admin
  const sectionFin = document.getElementById('section-financeiro');
  if (sectionFin) sectionFin.style.display = isAdmin ? '' : 'none';

  // Admin sidebar items — só admin (já controlado por _updateAdminVisibility,
  // mas garantimos aqui também)
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

// ── Sessão Supabase → estado do app ──────────────────────────────────────────
async function applySession(session) {
  if (!session) {
    _currentSession = null;
    _currentRole    = 'agent';
    window.__serverSession = { authenticated: false, isAdmin: false };
    _showLogin();
    return;
  }

  _currentSession = session;
  _currentRole    = await fetchRole(session.user.id);

  const isAdmin = _currentRole === 'admin';
  window.__serverSession = { authenticated: true, isAdmin };

  // Hidrata localStorage com os dados do Supabase (se ainda não foi feito)
  await sbHydrate();

  // Activa a sincronização em background (localStorage ↔ Supabase)
  sbStartSync();

  _hideLogin();
  _updateAdmin();
  applyRoleUI(_currentRole);
}

// ── Override: login ───────────────────────────────────────────────────────────
window.__loginSubmitReal = async function() {
  if (!SUPABASE_ENABLED) {
    console.warn('[auth] Supabase não configurado — preencha .env');
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.textContent = '⚠️ Supabase não configurado. Adicione as variáveis no .env';
      errEl.style.display = 'block';
    }
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

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Connexion…'; }
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });

    if (error) {
      if (errEl) {
        errEl.textContent = /Invalid login|invalid credentials/i.test(error.message)
          ? '❌ Identifiants invalides — vérifiez votre email et mot de passe.'
          : '⚠️ ' + error.message;
        errEl.style.display = 'block';
      }
      if (pwEl) { pwEl.value = ''; pwEl.focus(); }
      return;
    }

    await applySession(data.session);

    // Chamar __hydrate do app.js se disponível (carrega dossiers na UI)
    if (typeof window.__hydrate === 'function') setTimeout(window.__hydrate, 150);

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
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  // Limpa estado local
  _currentSession = null;
  window.__serverSession = { authenticated: false, isAdmin: false };
  location.reload();
};

// ── Override: verificação de sessão (chamada pelo app.js no boot) ─────────────
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
    console.warn('[auth] Supabase não configurado — a app funciona em modo localStorage.');
    return;
  }

  // Escuta mudanças de sessão (ex: token expirado, login noutro tab)
  supabase.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });

  // Verifica sessão existente no arranque
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    // Aplica imediatamente sem esperar pelo _checkServerSession do app.js
    await applySession(session);
  }
  // Se não há sessão, o login overlay já está visível (app.js mostra por defeito)
}

// Corre assim que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ── Expõe role publicamente para outros módulos ───────────────────────────────
export function getCurrentRole()    { return _currentRole; }
export function getCurrentSession() { return _currentSession; }
