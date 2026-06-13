/**
 * client-picker.js — Busca e criação de cliente no Ticketing (A6 — Fase 9)
 *
 * - A6.1 Primeira opção fixa e destacada "+ Créer un nouveau client", antes de
 *   qualquer resultado da busca (aparece também ao focar a busca).
 * - A6.2 Campos de preenchimento ocultos por padrão; só aparecem ao clicar em
 *   criar (modo edição) — ou ao carregar um cliente existente (modo leitura).
 * - A6.3 Cliente existente carrega em modo somente leitura, com ícone de lápis
 *   para habilitar a edição.
 *
 * Trabalha por cima da busca existente (window.cliDbSearch / cliDbLoadClient),
 * sem reescrever a base de clientes (expatur_clients_db).
 */

let _mode = 'hidden';   // 'hidden' | 'view' | 'edit'

function _grid()  { return document.getElementById('cli-form-grid'); }
function _notes() { return document.getElementById('cli-form-notes'); }
function _panel() { return document.getElementById('dv-panel-client'); }

// campos do formulário de cliente (exclui a barra de busca)
function _fields() {
  const p = _panel(); if (!p) return [];
  return Array.prototype.slice.call(p.querySelectorAll('[id^="cli-"]'))
    .filter(el => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.id !== 'cli-db-search');
}

function _hasClientData() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  return !!(v('cli-nom').trim() || v('cli-prenom').trim() || v('cli-email').trim());
}

/* ── Aplicar modo ────────────────────────────────────────────────────────── */
function _apply(mode) {
  _mode = mode;
  const show = mode !== 'hidden';
  const readonly = mode === 'view';
  if (_grid())  _grid().style.display  = show ? 'grid' : 'none';
  if (_notes()) _notes().style.display = show ? '' : 'none';

  _fields().forEach((el) => {
    if (el.tagName === 'SELECT') el.disabled = readonly;
    else el.readOnly = readonly;
    el.style.opacity = readonly ? '0.85' : '';
    el.style.cursor = readonly ? 'default' : '';
  });

  // botão lápis visível só em modo leitura
  const pen = document.getElementById('cli-edit-toggle');
  if (pen) pen.style.display = readonly ? 'inline-flex' : 'none';
}

/* ── Botão lápis (A6.3) ──────────────────────────────────────────────────── */
function _ensurePencil() {
  if (document.getElementById('cli-edit-toggle')) return;
  const p = _panel(); if (!p) return;
  const h2 = p.querySelector('h2');
  if (!h2) return;
  // coloca o h2 e o lápis numa linha
  if (h2.parentElement && h2.parentElement.id !== 'cli-head-row') {
    const row = document.createElement('div');
    row.id = 'cli-head-row';
    row.style.cssText = 'display:flex;align-items:center;gap:0.6rem;';
    h2.parentNode.insertBefore(row, h2);
    row.appendChild(h2);
    const btn = document.createElement('button');
    btn.id = 'cli-edit-toggle';
    btn.type = 'button';
    btn.title = 'Modifier';
    btn.innerHTML = '✏️';
    btn.style.cssText = 'display:none;align-items:center;justify-content:center;border:1px solid var(--border);background:#fff;border-radius:7px;width:30px;height:30px;cursor:pointer;font-size:0.9rem;';
    btn.onclick = function () { _apply('edit'); const f = document.getElementById('cli-prenom'); if (f) f.focus(); };
    row.appendChild(btn);
  }
}

/* ── "+ Créer un nouveau client" no topo dos resultados (A6.1) ────────────── */
function _createItemHTML() {
  return '<div class="cli-search-item cli-create-item" onclick="window.__cliCreateNew()" '
    + 'style="background:rgba(201,162,39,0.10);border-left:3px solid var(--gold);font-weight:700;color:var(--navy);">'
    + '+ Créer un nouveau client</div>';
}
function _injectCreate() {
  const res = document.getElementById('cli-db-results');
  if (!res) return;
  if (!res.querySelector('.cli-create-item')) res.innerHTML = _createItemHTML() + res.innerHTML;
  res.classList.add('open');
}

window.__cliCreateNew = function () {
  _fields().forEach((el) => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  const res = document.getElementById('cli-db-results');
  if (res) { res.classList.remove('open'); res.innerHTML = ''; }
  const inp = document.getElementById('cli-db-search');
  if (inp) inp.value = '';
  _apply('edit');
  const f = document.getElementById('cli-prenom'); if (f) f.focus();
  if (typeof window.clientSync === 'function') { try { window.clientSync(); } catch (e) {} }
};

/* ── Hooks ───────────────────────────────────────────────────────────────── */
function _onEnterClient() {
  _ensurePencil();
  _apply(_hasClientData() ? 'view' : 'hidden');
}

function _hook(name, after) {
  const fn = window[name];
  if (typeof fn !== 'function' || fn.__cliHook__) return !!(fn && fn.__cliHook__);
  const wrapped = function () {
    const r = fn.apply(this, arguments);
    try { after.apply(this, arguments); } catch (e) {}
    return r;
  };
  wrapped.__cliHook__ = true;
  window[name] = wrapped;
  return true;
}

function _init() {
  let tries = 0;
  const t = setInterval(() => {
    // "+ Créer" sempre presente após cada busca (A6.1)
    _hook('cliDbSearch', () => setTimeout(_injectCreate, 0));
    // cliente carregado → modo leitura (A6.3)
    _hook('cliDbLoadClient', () => setTimeout(() => { _ensurePencil(); _apply('view'); }, 30));
    // ao entrar na aba Client → estado inicial (A6.2)
    _hook('quotingSwitch', (tab) => { if (tab === 'client') { setTimeout(_onEnterClient, 30); setTimeout(_onEnterClient, 400); } });
    // scan de passaporte preenche os campos → revela o form em modo edição
    _hook('cliApplyScanData', () => setTimeout(() => { _ensurePencil(); _apply('edit'); }, 30));
    // troca de dossiê → reavalia o estado se a aba Client estiver visível
    _hook('_dossierLoad', () => setTimeout(() => {
      const p = _panel();
      if (p && p.offsetParent !== null) _onEnterClient();
    }, 200));

    const ready = window.cliDbSearch && window.cliDbSearch.__cliHook__;
    if (ready || ++tries > 40) {
      clearInterval(t);
      // mostra "+ Créer" ao focar a busca, mesmo sem texto
      const inp = document.getElementById('cli-db-search');
      if (inp && !inp.__cliFocus) { inp.__cliFocus = true; inp.addEventListener('focus', _injectCreate); }
      _onEnterClient();
    }
  }, 500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();
