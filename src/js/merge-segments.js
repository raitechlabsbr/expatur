/**
 * merge-segments.js — "Juntar os Segmentos" / Joindre les segments (A10 — Fase 9)
 *
 * Persiste a flag `juntar-segmentos` no deal (fields do dossier ativo), o que:
 *   - sincroniza para o Supabase via storage.js (jsonb) — auto-save (A10.6);
 *   - fica acessível ao gerador de PDF (openBilletModal lê via __readJuntarSeg
 *     e renderiza o billet em modo single → 1 PNR/billet, PDF de layout único).
 *
 * A renderização e o PDF em si vivem no billet modal do app.js; aqui só
 * cuidamos da leitura/escrita persistida e do re-render ao alternar.
 */

function _activeId() {
  try { return localStorage.getItem('expatur_active_dossier') || null; } catch (e) { return null; }
}

// lê a flag do dossier ativo (o billet é sempre do deal aberto)
window.__readJuntarSeg = function () {
  try {
    const id = _activeId(); if (!id) return false;
    const d = JSON.parse(localStorage.getItem('expatur_dossier_' + id) || 'null');
    return !!(d && d.fields && d.fields['juntar-segmentos'] === '1');
  } catch (e) { return false; }
};

// alterna a flag (auto-save via setItem → sync do storage.js) e re-renderiza
window.__toggleJuntarSeg = function (cb) {
  const checked = !!(cb && cb.checked);
  try {
    const id = _activeId();
    if (id) {
      const k = 'expatur_dossier_' + id;
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (d) {
        if (!d.fields) d.fields = {};
        d.fields['juntar-segmentos'] = checked ? '1' : '';
        localStorage.setItem(k, JSON.stringify(d));   // dispara o sync (auto-save)
      }
    }
  } catch (e) {}
  if (typeof window.__logEvent === 'function') {
    try {
      const ref = (document.getElementById('booking-ref') || {}).value || '';
      window.__logEvent('UPDATE', 'ticketing', { entity_id: ref, field_changed: 'juntar_segmentos', new_value: checked ? 'on' : 'off' });
    } catch (e) {}
  }
  if (typeof window.openBilletModal === 'function') window.openBilletModal();
};
