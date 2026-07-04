/**
 * supplier-ledger.js — Ledger de Fornecedores ("Abertos") — núcleo + toggle local
 *
 * Porta VERBATIM de docs/monolito.html (produção = fonte de verdade):
 *   - _fornLedgerRowsAll ................ monolito 16958-16970
 *   - _fornPendingMap .................... monolito 16971-16984
 *   - _abertoFor / coluna "Em Aberto" + caixa "Total Em Aberto" .. monolito ~16915-16945
 *   - fornTogglePago330 (flip pago/status no ledger global E nos
 *     expatur_doss_finance_*) ............ monolito 34657-34701
 *   - _emSetPago (versão LOCAL apenas) ... adaptado de monolito 78354-78359
 *     (sem o _push/_apply Cloudflare — essa parte é da Task 3/Supabase)
 *
 * NÃO porta nada relativo à integração Cloudflare hoje dropada desta feature
 * (a API remota de voos, os CSVs de voo, os pulls/pushes de sincronização
 * remota, nem polling via setInterval).
 *
 * Este módulo corre num IIFE separado (não tem acesso às closures do app.js),
 * por isso qualquer coisa que precise do fornRender / colGetVisible da
 * plataforma passa exclusivamente por `window.*` (nunca acesso direto).
 */
(function () {
  'use strict';
  if (window._supplierLedgerLoaded) return;
  window._supplierLedgerLoaded = true;

  var _GFIN = 'expatur_financeiro_lancamentos';
  var _FORN_KEY = 'expatur_fornecedores';

  /* ── Formatação BRL (verbatim monolito 16957) ─────────────────────────── */
  function _fmtBRLForn(n) {
    n = parseFloat(n) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function _normNomeF(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  /* ══════════════════════════════════════════════════════════════════════
     _fornLedgerRowsAll — verbatim monolito 16958-16970
     Junta o ledger global + todos os expatur_doss_finance_*, de-duplicado
     por source_id (o global tem precedência quando o mesmo source_id
     aparece em ambos).
     ══════════════════════════════════════════════════════════════════════ */
  function _fornLedgerRowsAll() {
    var rows = [], seen = {};
    try {
      var g = JSON.parse(localStorage.getItem(_GFIN) || '[]');
      if (Array.isArray(g)) {
        g.forEach(function (r) { if (r && r.source_id) seen[r.source_id] = true; rows.push(r); });
      }
    } catch (e) {}
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('expatur_doss_finance_') !== 0) return;
        var d = null; try { d = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
        if (!d || !Array.isArray(d.expenses)) return;
        d.expenses.forEach(function (e) {
          if (e && e.source_id && seen[e.source_id]) return;
          if (e && e.source_id) seen[e.source_id] = true;
          rows.push(e);
        });
      });
    } catch (e) {}
    return rows;
  }

  /* ══════════════════════════════════════════════════════════════════════
     _fornPendingMap — verbatim monolito 16971-16984
     Total PENDENTE por fornecedor (nome normalizado), somando apenas as
     linhas do ledger que NÃO estão pagas.
     ══════════════════════════════════════════════════════════════════════ */
  function _fornPendingMap(suppliers) {
    function nm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    function paid(p) { p = String(p || '').toLowerCase(); return p === 'pago' || p === 'paid'; }
    function amt(r) {
      var m = parseFloat(r.volume_miles != null ? r.volume_miles : r.miles) || 0,
          c = parseFloat(r.cpm_brl != null ? r.cpm_brl : r.cpm) || 0,
          t = parseFloat(r.taxas_brl != null ? r.taxas_brl : r.taxas) || 0;
      return (m > 0 && c > 0) ? (m / 1000 * c + t) : (parseFloat(r.brl_amount != null ? r.brl_amount : (r.amount != null ? r.amount : r.valor)) || 0);
    }
    var idToNorm = {}; (suppliers || []).forEach(function (f) { if (f.id) idToNorm[f.id] = nm(f.nome); });
    var map = {};
    _fornLedgerRowsAll().forEach(function (r) {
      if (!r || paid(r.pago || r.status)) return;
      var key = (r.fornecedor_id && idToNorm[r.fornecedor_id] != null) ? idToNorm[r.fornecedor_id] : nm(r.fornecedor);
      if (!key) return;
      map[key] = (map[key] || 0) + amt(r);
    });
    return map;
  }

  function _loadForns() {
    try { var a = JSON.parse(localStorage.getItem(_FORN_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }

  /* _abertoFor(f) — "Valor em Aberto" de um fornecedor (monolito 16917) */
  function _abertoFor(f) {
    var pendMap = _fornPendingMap(_loadForns());
    return pendMap[_normNomeF(f && f.nome)] || 0;
  }

  window._fornLedgerRowsAll = _fornLedgerRowsAll;
  window._fornPendingMap    = _fornPendingMap;
  window._abertoFor         = _abertoFor;

  /* ══════════════════════════════════════════════════════════════════════
     fornTogglePago330 — verbatim monolito 34657-34701.
     Alterna pago ⇄ pendente para uma linha (por source_id/id), gravando em
     AMBOS: o ledger global (expatur_financeiro_lancamentos) e em TODOS os
     stores por dossier (expatur_doss_finance_*). Sem push Cloudflare.
     ══════════════════════════════════════════════════════════════════════ */
  window.fornTogglePago330 = function (rowId, dossierRef) {
    if (!rowId) return;
    function _isPaid(p) { p = (p || '').toLowerCase(); return p === 'pago' || p === 'paid'; }
    var flip = null; /* decidido a partir da primeira linha encontrada, depois aplicado a todas */

    /* 1. Ledger global */
    try {
      var g = JSON.parse(localStorage.getItem(_GFIN) || '[]');
      var changed = false;
      g = g.map(function (x) {
        if ((x.source_id || x.id) === rowId) {
          if (flip === null) flip = _isPaid(x.pago || x.status) ? 'pendente' : 'pago';
          changed = true;
          return Object.assign({}, x, { pago: flip, status: flip });
        }
        return x;
      });
      if (changed) localStorage.setItem(_GFIN, JSON.stringify(g));
    } catch (e) {}

    /* 2. Store(s) por dossier */
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('expatur_doss_finance_') !== 0) return;
        var data = null;
        try { data = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
        if (!data || !Array.isArray(data.expenses)) return;
        var ch = false;
        data.expenses = data.expenses.map(function (x) {
          if ((x.source_id || x.id) === rowId) {
            if (flip === null) flip = _isPaid(x.pago || x.status) ? 'pendente' : 'pago';
            ch = true;
            return Object.assign({}, x, { pago: flip, status: flip });
          }
          return x;
        });
        if (ch) localStorage.setItem(k, JSON.stringify(data));
      });
    } catch (e) {}

    /* 3. Re-renderiza o popup de detalhe + as vistas de finanças + a lista de
       fornecedores (para o "Em Aberto" recomputar). Sem push Cloudflare. */
    try { if (typeof window._refreshFornDetails330 === 'function') window._refreshFornDetails330(); } catch (e) {}
    ['fornRender', 'finRenderLancamentos', 'finRenderKPIs', 'finRenderFluxo'].forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
    try { if (window._reconcileFinanceiro) window._reconcileFinanceiro(); } catch (e) {}
  };

  /* ══════════════════════════════════════════════════════════════════════
     _emSetPago(sourceId, pagoStr) — versão LOCAL apenas (adaptado de
     monolito 78354-78359, retirando o _apply()/_push() Cloudflare — essa
     parte de sincronização remota entra na Task 3, sobre Supabase).
     Atualiza o status pago/pendente de UMA linha (por source_id) tanto no
     ledger global quanto em todos os expatur_doss_finance_*.
     ══════════════════════════════════════════════════════════════════════ */
  window._emSetPago = function (sourceId, pagoStr) {
    if (!sourceId) return;
    var p = String(pagoStr || '').toLowerCase();
    var pago = (p === 'pago' || p === 'paid') ? 'pago' : 'pendente';

    try {
      var g = JSON.parse(localStorage.getItem(_GFIN) || '[]');
      if (Array.isArray(g)) {
        var changed = false;
        g = g.map(function (x) {
          if (x && (x.source_id || x.id) === sourceId) { changed = true; return Object.assign({}, x, { pago: pago, status: pago }); }
          return x;
        });
        if (changed) localStorage.setItem(_GFIN, JSON.stringify(g));
      }
    } catch (e) {}

    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('expatur_doss_finance_') !== 0) return;
        var data = null;
        try { data = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
        if (!data || !Array.isArray(data.expenses)) return;
        var ch = false;
        data.expenses = data.expenses.map(function (x) {
          if (x && (x.source_id || x.id) === sourceId) { ch = true; return Object.assign({}, x, { pago: pago, status: pago }); }
          return x;
        });
        if (ch) localStorage.setItem(k, JSON.stringify(data));
      });
    } catch (e) {}
  };

  /* ══════════════════════════════════════════════════════════════════════
     Integração com o fornRender da plataforma — coluna "Em Aberto" +
     caixa "Total Em Aberto" (padrão do monólito ~16915-16945).
     A plataforma já regista a coluna 'valorAberto' via COLS.forn (app.js) e
     já expõe window.colGetVisible/window.fornRender; como este módulo corre
     numa IIFE à parte (sem acesso às closures do app.js), a integração é
     feita por wrap aditivo de window.fornRender — mesma técnica usada pelo
     próprio monólito para corrigir a coluna/box a partir de fora da IIFE
     original (ver monolito ~78472-78479), mas aqui usando o ledger LOCAL
     (_fornPendingMap), não o mapa vindo do Cloudflare.
     ══════════════════════════════════════════════════════════════════════ */
  function _filteredForns() {
    var data = _loadForns();
    var q    = ((document.getElementById('forn-search') || {}).value || '').toLowerCase();
    var tipo = ((document.getElementById('forn-filter-tipo') || {}).value || '');
    if (q || tipo) {
      data = data.filter(function (f) {
        var m = !q || (f.nome || '').toLowerCase().indexOf(q) > -1 || (f.pais || '').toLowerCase().indexOf(q) > -1
          || (f.cnpj || '').toLowerCase().indexOf(q) > -1 || (f.contato || '').toLowerCase().indexOf(q) > -1 || (f.email || '').toLowerCase().indexOf(q) > -1;
        return m && (!tipo || f.tipo === tipo);
      });
    }
    return data;
  }

  function _ensureTotalAbertoBox() {
    var box = document.getElementById('forn-total-aberto');
    if (box) return box;
    var tbody = document.getElementById('forn-table-body');
    var tableWrap = tbody && tbody.closest ? tbody.closest('.db-table-wrap') : null;
    if (!tableWrap || !tableWrap.parentNode) return null;
    box = document.createElement('div');
    box.id = 'forn-total-aberto';
    box.style.cssText = 'display:none;align-items:center;gap:0.6rem;margin-bottom:0.75rem;background:linear-gradient(90deg,rgba(192,0,0,0.06),rgba(192,0,0,0.02));border:1px solid rgba(192,0,0,0.18);border-radius:10px;padding:0.55rem 0.95rem;';
    box.innerHTML =
      '<span style="font-size:0.6rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--navy-soft,#3a5068);">Total Em Aberto Fornecedor</span>' +
      '<span id="forn-total-aberto-val" style="font-size:1.05rem;font-weight:800;color:var(--red,#c00);margin-left:auto;">R$ 0,00</span>';
    tableWrap.parentNode.insertBefore(box, tableWrap);
    return box;
  }

  function _patchAbertoColumn() {
    var body = document.getElementById('forn-table-body');
    if (!body) return;

    var data = _filteredForns();
    var pendMap = _fornPendingMap(_loadForns());

    /* Caixa "Total Em Aberto" = soma sobre os fornecedores ATUALMENTE exibidos */
    var box = _ensureTotalAbertoBox();
    var valEl = document.getElementById('forn-total-aberto-val');
    if (box && valEl) {
      var tot = 0; data.forEach(function (f) { tot += pendMap[_normNomeF(f.nome)] || 0; });
      valEl.textContent = _fmtBRLForn(tot);
      box.style.display = data.length ? 'flex' : 'none';
    }

    /* Coluna "Valor em Aberto" — só existe se registada/visível em COLS.forn */
    var cols = (typeof window.colGetVisible === 'function') ? window.colGetVisible('forn') : [];
    var valorIdx = -1;
    cols.forEach(function (c, i) { if (c.key === 'valorAberto') valorIdx = i; });
    if (valorIdx < 0) return;

    var rows = body.querySelectorAll('tr');
    rows.forEach(function (tr, i) {
      if (tr.querySelector('.db-empty')) return;
      var f = data[i];
      var cell = tr.cells && tr.cells[valorIdx];
      if (!f || !cell) return;
      var v = pendMap[_normNomeF(f.nome)] || 0;
      cell.innerHTML = (v > 0 ? _fmtBRLForn(v) : '—');
      cell.style.textAlign = 'right';
      cell.style.fontWeight = '700';
      cell.style.whiteSpace = 'nowrap';
      cell.style.color = (v > 0 ? 'var(--red,#c00)' : 'var(--navy-soft,#3a5068)');
    });
  }

  /* Wrap aditivo de window.fornRender: corre DEPOIS de qualquer outro wrap
     já instalado (v3.30 detail patch, etc.) sem alterar o seu comportamento. */
  function _wrapFornRenderForAberto() {
    var orig = window.fornRender;
    if (typeof orig !== 'function' || orig._ledgerAbertoWrapped) return false;
    var w = function () {
      var r = orig.apply(this, arguments);
      try { _patchAbertoColumn(); } catch (e) {}
      return r;
    };
    w._ledgerAbertoWrapped = true;
    window.fornRender = w;
    return true;
  }

  if (!_wrapFornRenderForAberto()) {
    /* fornRender ainda não estava definido (ordem de import) — tenta uma
       vez mais, adiado, sem polling contínuo (nada de setInterval/Cloudflare). */
    setTimeout(_wrapFornRenderForAberto, 0);
  }

})();
