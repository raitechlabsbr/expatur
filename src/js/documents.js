/**
 * documents.js — Documentos de viagem persistentes (spec 4.x + doc4 §5 — Fase 5)
 *
 * - Todo upload de documento vai para o bucket privado 'documents' do Supabase
 *   Storage, com metadados em `doc_files` vinculados ao booking-ref do deal
 *   aberto E ao nome do PAX (4.1) — migration 005.
 * - Pontos cobertos (4.1): linhas de anexos da aba Documents, arquivos por
 *   passageiro da aba Tickets (inclui o scan de passaporte, que já renomeia
 *   o arquivo com o nome extraído) e o Scan Passport da aba Client.
 * - Nenhuma URL pública: download somente via signed URL curta (4.2), com
 *   registro em `doc_access_log` (quem, qual documento, quando).
 * - Ao reabrir o dossier, os documentos arquivados carregam na aba Documents
 *   com download e exclusão ativos; excluir remove do Storage além do DOM
 *   (doc4 §5.2).
 * - Perfil do cliente (9.4): o modal do menu Clientes ganha o bloco
 *   "Documents archivés" com os documentos vinculados por dossier/nome.
 */
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

const BUCKET = 'documents';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const _sanit = s => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_');
function _toast(msg, kind) { if (typeof window.toast === 'function') window.toast(msg, kind || 'success'); }
function _ref() {
  const v = (document.getElementById('booking-ref') || {}).value;
  if (v && v.trim()) return v.trim();
  try { return localStorage.getItem('expatur_active_dossier') || ''; } catch (e) { return ''; }
}
function _paxName(pi) {
  if (typeof window._getPaxDisplayName === 'function') {
    try { const n = window._getPaxDisplayName(pi); if (n) return n; } catch (e) {}
  }
  return '';
}
function _fmtWhen(iso) {
  try { return new Date(iso).toLocaleDateString('fr-FR'); } catch (e) { return ''; }
}

let _user = null;
async function _email() {
  if (_user) return _user;
  try {
    const s = (await supabase.auth.getSession()).data?.session;
    if (s?.user) _user = s.user.email || s.user.id;
  } catch (e) {}
  return _user;
}

/* ── Núcleo: upload / lista / download / exclusão ────────────────────────── */
async function uploadDealDoc(file, meta) {
  if (!SUPABASE_ENABLED || !supabase || !file) return null;
  const ref = meta.dossierRef || _ref();
  if (!ref) return null;
  const ext = (String(file.name).split('.').pop() || 'bin').toLowerCase();
  const slot = { dossier_ref: ref, pax_index: meta.paxIndex || 0, doc_key: meta.docKey || 'file' };
  const path = `${_sanit(ref)}/${slot.pax_index}-${_sanit(slot.doc_key)}.${ext}`;

  try {
    // slot já ocupado com outro arquivo físico? remove o antigo do Storage
    const { data: prev } = await supabase.from('doc_files').select('id, storage_path')
      .eq('dossier_ref', slot.dossier_ref).eq('pax_index', slot.pax_index)
      .eq('doc_key', slot.doc_key).maybeSingle();
    if (prev && prev.storage_path && prev.storage_path !== path) {
      await supabase.storage.from(BUCKET).remove([prev.storage_path]);
    }

    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (upErr) throw upErr;

    const { data, error } = await supabase.from('doc_files').upsert({
      ...slot,
      client_ref:   meta.clientRef || ref,
      pax_name:     meta.paxName || null,
      filename:     meta.filename || file.name,
      mime_type:    file.type || null,
      size_bytes:   file.size || null,
      storage_path: path,
      uploaded_by:  await _email(),
    }, { onConflict: 'dossier_ref,pax_index,doc_key' }).select().single();
    if (error) throw error;
    _toast('Document archivé sur le serveur ✓');
    return data;
  } catch (e) {
    console.warn('[documents] upload falhou:', e.message);
    _toast('Échec de l’archivage du document: ' + e.message, 'error');
    return null;
  }
}

async function listDocs(ref) {
  if (!SUPABASE_ENABLED || !supabase || !ref) return [];
  try {
    const { data, error } = await supabase.from('doc_files').select('*')
      .eq('dossier_ref', ref).order('pax_index').order('doc_key');
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

// 4.2: signed URL curta (bucket privado — sem URL pública) + log de acesso
async function openDoc(docId, action) {
  if (!SUPABASE_ENABLED || !supabase) return;
  try {
    const { data: row, error } = await supabase.from('doc_files').select('*').eq('id', docId).single();
    if (error || !row) throw error || new Error('introuvable');
    const { data: signed, error: sErr } = await supabase.storage.from(BUCKET)
      .createSignedUrl(row.storage_path, 120);
    if (sErr || !signed?.signedUrl) throw sErr || new Error('signed URL');
    supabase.from('doc_access_log').insert({
      user_email: await _email(), doc_id: row.id,
      action: action || 'download', dossier_ref: row.dossier_ref,
    }).then(() => {});
    window.open(signed.signedUrl, '_blank', 'noopener');
  } catch (e) {
    _toast('Échec du téléchargement: ' + (e?.message || e), 'error');
  }
}

async function deleteDocRow(row) {
  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  await supabase.from('doc_files').delete().eq('id', row.id);
}

async function deleteDocSlot(ref, paxIndex, docKey) {
  if (!SUPABASE_ENABLED || !supabase || !ref) return;
  try {
    const { data: row } = await supabase.from('doc_files').select('*')
      .eq('dossier_ref', ref).eq('pax_index', paxIndex).eq('doc_key', docKey).maybeSingle();
    if (row) { await deleteDocRow(row); _toast('Document supprimé du serveur'); }
  } catch (e) { console.warn('[documents] delete falhou:', e.message); }
}

/* ── Aba Documents: hidratação ao reabrir + bloco "Documents archivés" ───── */
async function hydrateDocsPanel() {
  const panel = document.getElementById('dv-panel-docs');
  if (!panel) return;
  const ref = _ref();
  if (!ref) return;
  const rows = await listDocs(ref);

  // doc4 §5.2: slots das linhas de anexos voltam preenchidos (nome + ✕ ativos)
  if (!panel._files) panel._files = {};
  rows.forEach(r => {
    panel._files[r.pax_index + '-' + r.doc_key] = r.filename;
    const nameEl = document.getElementById('doc-fname-' + r.pax_index + '-' + r.doc_key);
    if (nameEl && !nameEl.textContent) {
      nameEl.textContent = '✓ ' + r.filename;
      let delBtn = document.getElementById('doc-del-' + r.pax_index + '-' + r.doc_key);
      if (!delBtn && nameEl.parentNode) {
        delBtn = document.createElement('button');
        delBtn.className = 'doc-annexe-del-btn';
        delBtn.id = 'doc-del-' + r.pax_index + '-' + r.doc_key;
        delBtn.innerHTML = '✕';
        delBtn.onclick = () => window.docAnnexeDeleteFile(r.pax_index, r.doc_key);
        nameEl.parentNode.appendChild(delBtn);
      }
    }
  });

  // Bloco com todos os documentos arquivados do dossier
  let host = document.getElementById('docs-server-list');
  if (!host) {
    host = document.createElement('div');
    host.id = 'docs-server-list';
    host.className = 'card full';
    panel.appendChild(host);
  }
  if (!rows.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
  host.style.display = '';
  host.innerHTML = '<h2 style="margin-top:0;">Documents archivés</h2>'
    + '<table style="width:100%;border-collapse:collapse;font-size:0.76rem;">'
    + '<thead><tr>'
    + ['Fichier', 'Passager', 'Type', 'Date', ''].map(h =>
        '<th style="text-align:left;font-size:0.58rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(6,32,59,0.5);padding:0.4rem 0.5rem;border-bottom:2px solid rgba(6,32,59,0.1);">' + h + '</th>').join('')
    + '</tr></thead><tbody>'
    + rows.map(r =>
        '<tr>'
        + '<td style="padding:0.4rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);font-weight:600;">📎 ' + _esc(r.filename) + '</td>'
        + '<td style="padding:0.4rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);">' + _esc(r.pax_name || '—') + '</td>'
        + '<td style="padding:0.4rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);font-family:monospace;font-size:0.68rem;">' + _esc(r.doc_key) + '</td>'
        + '<td style="padding:0.4rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);">' + _esc(_fmtWhen(r.uploaded_at)) + '</td>'
        + '<td style="padding:0.4rem 0.5rem;border-bottom:1px solid rgba(6,32,59,0.07);white-space:nowrap;text-align:right;">'
        +   '<button class="btn btn-navy btn-sm" style="font-size:0.62rem;padding:3px 9px;" onclick="window.docsDownload(' + r.id + ')">⬇ Télécharger</button> '
        +   '<button class="btn btn-sm" style="font-size:0.62rem;padding:3px 9px;color:var(--red,#D80505);" onclick="window.docsDeleteRow(' + r.id + ')">✕</button>'
        + '</td></tr>').join('')
    + '</tbody></table>';
}

window.docsDownload = id => openDoc(id, 'download');
window.docsDeleteRow = async function (id) {
  if (!confirm('Supprimer ce document du serveur ?')) return;
  try {
    const { data: row } = await supabase.from('doc_files').select('*').eq('id', id).single();
    if (row) {
      await deleteDocRow(row);
      const panel = document.getElementById('dv-panel-docs');
      if (panel && panel._files) delete panel._files[row.pax_index + '-' + row.doc_key];
      const nameEl = document.getElementById('doc-fname-' + row.pax_index + '-' + row.doc_key);
      if (nameEl) nameEl.textContent = '';
      _toast('Document supprimé');
    }
  } catch (e) { _toast('Échec: ' + e.message, 'error'); }
  hydrateDocsPanel();
};

/* ── Hooks nos pontos de upload (4.1 — todos os pontos) ──────────────────── */
function _hookAnnexeUpload() {
  const fn = window.docAnnexeFileChange;
  if (typeof fn !== 'function' || fn.__docsHook__) return typeof fn === 'function';
  window.docAnnexeFileChange = function (pi, key, input) {
    fn.apply(this, arguments);
    const file = input && input.files && input.files[0];
    if (file) {
      uploadDealDoc(file, { paxIndex: pi, docKey: key, paxName: _paxName(pi) })
        .then(() => hydrateDocsPanel());
    }
  };
  window.docAnnexeFileChange.__docsHook__ = true;
  return true;
}

function _hookAnnexeDelete() {
  const fn = window.docAnnexeDeleteFile;
  if (typeof fn !== 'function' || fn.__docsHook__) return typeof fn === 'function';
  window.docAnnexeDeleteFile = function (pi, key) {
    const nameEl = document.getElementById('doc-fname-' + pi + '-' + key);
    const before = nameEl ? nameEl.textContent : '';
    fn.apply(this, arguments);
    const after = nameEl ? nameEl.textContent : '';
    if (before && !after) {            // usuário confirmou — doc4 §5.2: remove do servidor
      deleteDocSlot(_ref(), pi, key).then(() => hydrateDocsPanel());
    }
  };
  window.docAnnexeDeleteFile.__docsHook__ = true;
  return true;
}

// Aba Tickets: arquivos por passageiro (o scan injeta "NOM PRENOM PASSPORT.ext")
function _onPaxFilesChange(ev) {
  const el = ev.target;
  if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return;
  const m = /^bl-pax-(\d+)-files$/.exec(el.id || '');
  if (!m) return;
  const pi = parseInt(m[1], 10);
  if (!el.__docsUploaded) el.__docsUploaded = new Set();
  Array.from(el.files || []).forEach(f => {
    if (el.__docsUploaded.has(f.name)) return;
    el.__docsUploaded.add(f.name);
    const isPassport = /passport/i.test(f.name);
    const docKey = isPassport ? 'passport' : 'file-' + _sanit(f.name).toLowerCase();
    const paxName = (isPassport ? f.name.replace(/\s*passport\.[a-z0-9]+$/i, '').trim() : '') || _paxName(pi);
    uploadDealDoc(f, { paxIndex: pi, docKey, paxName });
  });
}

// Aba Client: Scan Passport → "Appliquer" arquiva no perfil do cliente (4.1)
function _hookCliApply() {
  const fn = window.cliApplyScanData;
  if (typeof fn !== 'function' || fn.__docsHook__) return typeof fn === 'function';
  window.cliApplyScanData = function () {
    fn.apply(this, arguments);
    const file = window._cliPassportFile;
    if (!file) return;
    const nom    = ((document.getElementById('cli-nom') || {}).value || '').trim();
    const prenom = ((document.getElementById('cli-prenom') || {}).value || '').trim();
    const paxName = (nom + ' ' + prenom).trim();
    const ext = (String(file.name).split('.').pop() || 'jpg').toLowerCase();
    uploadDealDoc(file, {
      paxIndex: 0, docKey: 'passport', paxName,
      filename: (paxName || 'PASSAGER') + ' PASSPORT.' + ext,   // nomeação automática
      clientRef: _ref(),
    });
  };
  window.cliApplyScanData.__docsHook__ = true;
  return true;
}

/* ── Perfil do cliente (9.4): bloco Documents archivés no modal ──────────── */
async function _injectClientDocs() {
  if (!SUPABASE_ENABLED || !supabase) return;
  const panel = document.getElementById('cpmod-panel-perfil');
  if (!panel) return;
  const c = window._cpmodClientRef || {};
  const rows = [];
  const seen = new Set();
  try {
    if (c.lastDossier) {
      const { data } = await supabase.from('doc_files').select('*')
        .eq('client_ref', c.lastDossier).order('uploaded_at', { ascending: false }).limit(50);
      (data || []).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } });
    }
    const nom = (c.nom || '').trim();
    if (nom.length >= 3) {
      const { data } = await supabase.from('doc_files').select('*')
        .ilike('pax_name', '%' + nom.replace(/[%_,]/g, '') + '%')
        .order('uploaded_at', { ascending: false }).limit(50);
      (data || []).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } });
    }
  } catch (e) {}

  let host = document.getElementById('cpmod-server-docs');
  if (!host) {
    host = document.createElement('div');
    host.id = 'cpmod-server-docs';
    host.style.gridColumn = '1 / -1';
    panel.appendChild(host);
  }
  if (!rows.length) { host.innerHTML = ''; return; }
  host.innerHTML =
    '<div style="font-size:0.56rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(6,32,59,0.45);margin:0.8rem 0 0.4rem;">Documents archivés (serveur)</div>'
    + rows.map(r =>
        '<div style="display:flex;align-items:center;gap:0.6rem;padding:0.35rem 0;border-bottom:1px solid rgba(6,32,59,0.07);font-size:0.76rem;">'
        + '<span style="flex:1;font-weight:600;">📎 ' + _esc(r.filename) + '</span>'
        + '<span style="color:rgba(6,32,59,0.5);">' + _esc(r.dossier_ref) + ' · ' + _esc(_fmtWhen(r.uploaded_at)) + '</span>'
        + '<button class="btn btn-navy btn-sm" style="font-size:0.62rem;padding:3px 9px;" onclick="window.docsDownload(' + r.id + ')">⬇</button>'
        + '</div>').join('');
}

function _hookClientProfile() {
  const fn = window.clientsViewProfile;
  if (typeof fn !== 'function' || fn.__docsHook__) return typeof fn === 'function';
  window.clientsViewProfile = function () {
    const r = fn.apply(this, arguments);
    setTimeout(_injectClientDocs, 350);
    return r;
  };
  window.clientsViewProfile.__docsHook__ = true;
  return true;
}

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
function _init() {
  document.addEventListener('change', _onPaxFilesChange, true);
  // hidrata a aba Documents quando aberta
  document.addEventListener('click', ev => {
    if (ev.target.closest && ev.target.closest('#qt-tab-docs')) setTimeout(hydrateDocsPanel, 250);
  });
  const sd = window.switchDossier;
  if (typeof sd === 'function' && !sd.__docsHook__) {
    window.switchDossier = function () {
      const r = sd.apply(this, arguments);
      setTimeout(hydrateDocsPanel, 600);
      return r;
    };
    window.switchDossier.__docsHook__ = true;
  }
  // os hooks dependem dos exports do app.js — retry breve
  let tries = 0;
  const t = setInterval(() => {
    const ok = _hookAnnexeUpload() & _hookAnnexeDelete() & _hookCliApply() & _hookClientProfile();
    if (ok || ++tries > 20) clearInterval(t);
  }, 500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();

/* ── API global ──────────────────────────────────────────────────────────── */
window.DEAL_DOCS = { upload: uploadDealDoc, list: listDocs, open: openDoc, hydrate: hydrateDocsPanel };
