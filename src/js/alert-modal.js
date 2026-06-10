/**
 * alert-modal.js — Substitui window.alert() por modal amigável
 *
 * Detecta automaticamente o tipo pela mensagem:
 *   ⚠  / Erreur / erro / error  → error (vermelho)
 *   ✓  / succès / sucesso       → success (verde)
 *   !  / Attention / aviso      → warning (amarelo)
 *   (default)                   → info (azul)
 *
 * Uso idêntico ao nativo: window.alert('mensagem')
 * Compatível com código existente — nenhum outro ficheiro precisa mudar.
 */

// ── Injectar HTML do modal uma única vez ──────────────────────────────────────
function _injectModalDOM() {
  if (document.getElementById('xp-alert-overlay')) return;

  const el = document.createElement('div');
  el.id = 'xp-alert-overlay';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'xp-alert-title');
  el.setAttribute('aria-describedby', 'xp-alert-body');
  el.innerHTML = `
    <div id="xp-alert-box">
      <div id="xp-alert-header">
        <div id="xp-alert-icon" aria-hidden="true"></div>
        <span id="xp-alert-title"></span>
      </div>
      <div id="xp-alert-body"></div>
      <div id="xp-alert-footer">
        <button id="xp-alert-ok">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  // Fechar ao clicar fora da caixa
  el.addEventListener('click', function(e) {
    if (e.target === el) _closeModal();
  });

  // Fechar com Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && el.classList.contains('visible')) _closeModal();
    if (e.key === 'Enter'  && el.classList.contains('visible')) _closeModal();
  });

  document.getElementById('xp-alert-ok').addEventListener('click', _closeModal);
}

let _resolveAlert = null;

function _closeModal() {
  const overlay = document.getElementById('xp-alert-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  // Restaura foco ao elemento anterior
  if (_prevFocus) { try { _prevFocus.focus(); } catch(_) {} }
  _prevFocus = null;
  if (_resolveAlert) { _resolveAlert(); _resolveAlert = null; }
}

let _prevFocus = null;

// ── Detectar tipo pela mensagem ───────────────────────────────────────────────
function _detectType(msg) {
  const s = String(msg || '').toLowerCase();
  if (/erreur|error|erro|incorrect|invalide|invalid|⚠|✗|❌|mot de passe/.test(s)) return 'error';
  if (/succès|success|sucesso|créée|créé|importé|terminé|✓|✔/.test(s)) return 'success';
  if (/attention|aviso|warning|veuillez|sélectionner/.test(s)) return 'warning';
  return 'info';
}

const _ICONS = {
  info:    '💬',
  success: '✓',
  error:   '✗',
  warning: '⚠',
};
const _TITLES = {
  info:    'Information',
  success: 'Succès',
  error:   'Erreur',
  warning: 'Attention',
};

// ── API principal ─────────────────────────────────────────────────────────────
function xpAlert(message, type) {
  return new Promise(function(resolve) {
    _injectModalDOM();

    const overlay  = document.getElementById('xp-alert-overlay');
    const iconEl   = document.getElementById('xp-alert-icon');
    const titleEl  = document.getElementById('xp-alert-title');
    const bodyEl   = document.getElementById('xp-alert-body');
    const okBtn    = document.getElementById('xp-alert-ok');

    const t = type || _detectType(message);

    iconEl.textContent  = _ICONS[t]   || _ICONS.info;
    iconEl.className    = t;
    titleEl.textContent = _TITLES[t]  || _TITLES.info;
    bodyEl.textContent  = String(message || '');
    okBtn.className     = t === 'info' ? '' : `ok-${t}`;

    _resolveAlert = resolve;
    _prevFocus    = document.activeElement;

    overlay.classList.add('visible');
    // Foco no botão OK para acessibilidade e Enter-to-close
    requestAnimationFrame(() => okBtn.focus());
  });
}

// ── Substituir window.alert ───────────────────────────────────────────────────
// Guardamos o original para fallback (ex: durante geração de PDF quando DOM pode estar oculto)
const _nativeAlert = window.alert.bind(window);

window.alert = function(message) {
  // Se o body ainda não estiver no DOM (muito improvável mas seguro)
  if (!document.body) { _nativeAlert(message); return; }
  xpAlert(message);
};

// Expõe para uso directo com tipo explícito:
//   window.xpAlert('mensagem', 'success')
//   window.xpAlert('mensagem', 'error')
window.xpAlert = xpAlert;

// ── Modal de confirmação (dois botões) ────────────────────────────────────────
let _resolveConfirm = null;
let _prevConfirmFocus = null;

function _injectConfirmDOM() {
  if (document.getElementById('xp-confirm-overlay')) return;
  const el = document.createElement('div');
  el.id = 'xp-confirm-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div id="xp-confirm-box">
      <div id="xp-confirm-header">
        <div id="xp-confirm-icon" aria-hidden="true"></div>
        <span id="xp-confirm-title"></span>
      </div>
      <div id="xp-confirm-body"></div>
      <div id="xp-confirm-footer">
        <button id="xp-confirm-cancel">Annuler</button>
        <button id="xp-confirm-ok">Confirmer</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.addEventListener('click', e => { if (e.target === el) _confirmResolve(false); });
  document.addEventListener('keydown', e => {
    if (!el.classList.contains('visible')) return;
    if (e.key === 'Escape') _confirmResolve(false);
  });
  el.querySelector('#xp-confirm-cancel').addEventListener('click', () => _confirmResolve(false));
  el.querySelector('#xp-confirm-ok').addEventListener('click',     () => _confirmResolve(true));
}

function _confirmResolve(result) {
  const overlay = document.getElementById('xp-confirm-overlay');
  if (overlay) overlay.classList.remove('visible');
  if (_prevConfirmFocus) { try { _prevConfirmFocus.focus(); } catch(_) {} }
  _prevConfirmFocus = null;
  if (_resolveConfirm) { _resolveConfirm(result); _resolveConfirm = null; }
}

/**
 * xpConfirm(message, opts) → Promise<boolean>
 * opts: { title, icon, okLabel, cancelLabel, type: 'danger'|'warning'|'info' }
 */
function xpConfirm(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    _injectConfirmDOM();
    const overlay    = document.getElementById('xp-confirm-overlay');
    const iconEl     = document.getElementById('xp-confirm-icon');
    const titleEl    = document.getElementById('xp-confirm-title');
    const bodyEl     = document.getElementById('xp-confirm-body');
    const okBtn      = document.getElementById('xp-confirm-ok');
    const cancelBtn  = document.getElementById('xp-confirm-cancel');

    const type = opts.type || 'warning';
    iconEl.textContent  = opts.icon || (type === 'danger' ? '⚠' : '?');
    iconEl.className    = type === 'danger' ? 'error' : type;
    titleEl.textContent = opts.title || 'Confirmation';
    bodyEl.innerHTML    = String(message || '');
    okBtn.textContent   = opts.okLabel     || 'Confirmer';
    okBtn.className     = type === 'danger' ? 'xp-confirm-danger' : 'xp-confirm-primary';
    cancelBtn.textContent = opts.cancelLabel || 'Annuler';

    _resolveConfirm  = resolve;
    _prevConfirmFocus = document.activeElement;
    overlay.classList.add('visible');
    requestAnimationFrame(() => okBtn.focus());
  });
}

window.xpConfirm = xpConfirm;
