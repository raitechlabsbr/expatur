// ═══════════════════════════════════════════════════════════════════════════
// COMMS — email de confirmação de reserva (FR/EN/ES). Port fiel do monólito.
// Backend de envio: Supabase Edge Function `send-email` (Resend) — ver Task 3.
// i18n isolado: dicionário próprio + T()/_pdfLang locais (NÃO usa i18n.js).
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, SUPABASE_ENABLED } from './supabase-client.js';

// Dicionário do COMMS. Valores copiados VERBATIM de docs/monolito.html
// (FR ~6711, EN ~6743, ES ~6775).
const _COMMS_I18N = {
  fr: {
    cm_intro:'Notre équipe vous remercie d’avoir choisi EXPATUR TRAVEL pour l’achat de votre billet d’avion. Votre réservation est confirmée et voici ci-dessous les informations détaillées de votre voyage.',
    cm_header_sub:'Confirmation de Réservation', cm_flight_details:'Itinéraire', cm_baggage:'Franchise(s) bagages',
    cm_cabin:'Cabine', cm_hold:'Bagages en soute', cm_recap:'Récapitulatif', cm_recipient:'Destinataire',
    cm_help:'Besoin d’assistance ?', cm_rights:'Expatur Travel 2026 — Tous droits réservés.',
    cm_confirmed:'CONFIRMÉ', cm_direct:'Direct', cm_stop:'escale', cm_stops:'escales',
    cm_subject:'Confirmation de réservation', cm_pax_count:'Passagers',
    cm_vol_aller:'Vol aller', cm_vol_retour:'Vol retour', cm_vol_n:'Vol', cm_ref_label:'Référence',
    issued_on:'Émis le', passengers:'Passagers', passengers_one:'Passager', travel_class:'Classe'
  },
  en: {
    cm_intro:'Our team thanks you for choosing EXPATUR TRAVEL for your flight ticket purchase. Your booking is confirmed and below are the detailed information of your trip.',
    cm_header_sub:'Booking Confirmation', cm_flight_details:'Itinerary', cm_baggage:'Baggage allowance',
    cm_cabin:'Cabin', cm_hold:'Checked baggage', cm_recap:'Summary', cm_recipient:'Recipient',
    cm_help:'Need assistance?', cm_rights:'Expatur Travel 2026 — All rights reserved.',
    cm_confirmed:'CONFIRMED', cm_direct:'Direct', cm_stop:'stop', cm_stops:'stops',
    cm_subject:'Booking Confirmation', cm_pax_count:'Passengers',
    cm_vol_aller:'Outbound flight', cm_vol_retour:'Return flight', cm_vol_n:'Flight', cm_ref_label:'Reference',
    issued_on:'Issued on', passengers:'Passengers', passengers_one:'Passenger', travel_class:'Travel Class'
  },
  es: {
    cm_intro:'Nuestro equipo le agradece haber elegido EXPATUR TRAVEL para la compra de su billete de avión. Su reserva está confirmada y a continuación encontrará la información detallada de su viaje.',
    cm_header_sub:'Confirmación de Reserva', cm_flight_details:'Itinerario', cm_baggage:'Franquicia de equipaje',
    cm_cabin:'Cabina', cm_hold:'Equipaje facturado', cm_recap:'Resumen', cm_recipient:'Destinatario',
    cm_help:'¿Necesita ayuda?', cm_rights:'Expatur Travel 2026 — Todos los derechos reservados.',
    cm_confirmed:'CONFIRMADO', cm_direct:'Directo', cm_stop:'escala', cm_stops:'escalas',
    cm_subject:'Confirmación de reserva', cm_pax_count:'Pasajeros',
    cm_vol_aller:'Vuelo de ida', cm_vol_retour:'Vuelo de vuelta', cm_vol_n:'Vuelo', cm_ref_label:'Referencia',
    issued_on:'Emitido el', passengers:'Pasajeros', passengers_one:'Pasajero', travel_class:'Clase'
  },
};
if (typeof window._pdfLang !== 'string') window._pdfLang = 'fr';
// T local: resolve a chave no idioma corrente; devolve a própria chave se faltar.
function T(k) {
  const lang = window._pdfLang || 'fr';
  return (_COMMS_I18N[lang] && _COMMS_I18N[lang][k]) || (_COMMS_I18N.fr && _COMMS_I18N.fr[k]) || k;
}
window._commsData = window._commsData || { pax: [], flights: [] };

// ─────────────────────────────────────────────────────────────────────────
// A partir daqui: port fiel de docs/monolito.html linhas 12237–13126
// (bloco contíguo de funções COMMS), MENOS a linha `var _commsData = {...}`
// (12237) — já coberta pela inicialização de window._commsData acima —
// e MENOS `_commsSend` (Task 3). Referências soltas a `_commsData` (sem
// `window.`) resolvem para `window._commsData` via objeto global, como no
// monólito original.
// Também incluído: `_commsSyncPnrToTicketing` (monolito.html 9187–9199).
// ─────────────────────────────────────────────────────────────────────────

function openCommsPopup() {
  var ov = document.getElementById('comms-popup');
  if (!ov) { console.warn('[COMMS] popup not found'); return; }
  if (ov.parentNode !== document.body) document.body.appendChild(ov);
  _commsAutofill();
  // Reflect the current language on the FR/EN toggle
  document.querySelectorAll('.cm-lang-btn').forEach(function(b){
    var on = (b.dataset.lang === (window._pdfLang||'fr'));
    b.classList.toggle('active', on);
    b.style.background = on ? '#06203b' : '#ffffff';
    b.style.color = on ? '#ffffff' : '#06203b';
  });
  ov.style.setProperty('display', 'flex', 'important');
  ov.style.setProperty('z-index', '999999', 'important');
  ov.onclick = function(e){ if (e.target === ov) closeCommsPopup(); };
  document.addEventListener('keydown', _commsEsc);
}
function _commsEsc(e){ if (e.key === 'Escape') closeCommsPopup(); }
function closeCommsPopup() {
  var ov = document.getElementById('comms-popup');
  if (ov) ov.style.setProperty('display', 'none', 'important');
  document.removeEventListener('keydown', _commsEsc);
}
window.openCommsPopup = openCommsPopup;
window.closeCommsPopup = closeCommsPopup;

// COMMS "Référence (PNR)" → ticketing master PNR (reverse direction).
function _commsSyncPnrToTicketing(value) {
  if (window._pnrSyncing) return;
  var v = String(value || '').toUpperCase();
  var mp = document.getElementById('bl-master-pnr');
  if (mp && mp.value !== v) {
    window._pnrSyncing = true;
    mp.value = v;
    if (typeof blSyncPnr === 'function') blSyncPnr(v);
    window._pnrSyncing = false;
  }
  try { if (typeof _commsRender === 'function') _commsRender(); } catch(e){}
}
window._commsSyncPnrToTicketing = _commsSyncPnrToTicketing;

// Pull everything we can from the current dossier / billet panel
// Resolve a full airline name for a leg: prefer SerpAPI's name on the leg/segment,
// else map the IATA code to a known carrier name, else fall back to the code.
var _COMMS_AIRLINE_NAMES = {
  AF:'Air France', KL:'KLM', BA:'British Airways', LH:'Lufthansa', IB:'Iberia',
  AZ:'ITA Airways', TP:'TAP Air Portugal', LX:'Swiss', OS:'Austrian Airlines',
  SN:'Brussels Airlines', AY:'Finnair', SK:'SAS', LO:'LOT Polish Airlines',
  EK:'Emirates', QR:'Qatar Airways', EY:'Etihad Airways', TK:'Turkish Airlines',
  SV:'Saudia', MS:'EgyptAir', RAM:'Royal Air Maroc', AT:'Royal Air Maroc',
  DL:'Delta Air Lines', AA:'American Airlines', UA:'United Airlines',
  AC:'Air Canada', B6:'JetBlue', WS:'WestJet',
  LA:'LATAM Airlines', JJ:'LATAM Brasil', G3:'GOL Linhas Aéreas', AD:'Azul',
  CM:'Copa Airlines', AV:'Avianca', AR:'Aerolíneas Argentinas',
  ET:'Ethiopian Airlines', KQ:'Kenya Airways', SA:'South African Airways',
  SU:'Aeroflot', AI:'Air India', SQ:'Singapore Airlines', CX:'Cathay Pacific',
  QF:'Qantas', NH:'ANA', JL:'Japan Airlines', CA:'Air China', MU:'China Eastern',
  CZ:'China Southern', TG:'Thai Airways', VS:'Virgin Atlantic', U2:'easyJet',
  FR:'Ryanair', VY:'Vueling', W6:'Wizz Air', DY:'Norwegian'
};
function _commsAirlineName(lg, code) {
  // 1) SerpAPI name carried on the leg or its first segment (most accurate)
  var serp = (lg && lg.airline) || (lg && lg.segments && lg.segments[0] && lg.segments[0].airline) || '';
  serp = String(serp).trim();
  // Only trust it if it's a real name, not just the code echoed back
  if (serp && serp.toUpperCase() !== String(code||'').toUpperCase()) return serp;
  // 2) Built-in IATA → name map
  var c = String(code||'').toUpperCase();
  if (_COMMS_AIRLINE_NAMES[c]) return _COMMS_AIRLINE_NAMES[c];
  // 3) Fall back to whatever we have (serp or code)
  return serp || c;
}

// Baggage fields (Cabine + Soute): both use qty × weight + unit, composed into a
// hidden field consumed by the email build. Unit always renders as "<unit>/pers".
function _commsBagSync(prefix, hiddenId) {
  var qty = (document.getElementById(prefix+'-qty')||{}).value || '';
  var wt  = (document.getElementById(prefix+'-wt')||{}).value || '';
  var unit= (document.getElementById(prefix+'-unit')||{}).value || 'kg';
  var hid = document.getElementById(hiddenId);
  if (hid) hid.value = (qty||'1') + 'x' + (wt||'0') + ' ' + unit + '/pers';
  if (typeof _commsRender === 'function') _commsRender();
}
// All interconnected baggage controls (COMMS Cabine/Soute + ticketing Cabine/Soute).
// Each entry: weight input id, unit select id.
var _ALL_BAG_CTRLS = [
  { wt:'cm-cabin-wt', unit:'cm-cabin-unit' },
  { wt:'cm-hold-wt',  unit:'cm-hold-unit'  },
  { wt:'bl-cabin-wt', unit:'bl-cabin-unit' },
  { wt:'bl-hold-wt',  unit:'bl-hold-unit'  }
];
// Convert one weight input to the target unit (based on its current dataset.unit).
function _convertWtEl(wtEl, unit) {
  if (!wtEl) return;
  // Treat an uninitialised control as kg so the first conversion is correct.
  var from = wtEl.dataset.unit || 'kg';
  if (wtEl.value !== '') {
    var v = parseFloat(wtEl.value) || 0;
    if (unit === 'lbs' && from === 'kg')      v = Math.round(v * 2.20462 * 10) / 10;
    else if (unit === 'kg' && from === 'lbs') v = Math.round(v / 2.20462 * 10) / 10;
    wtEl.value = v;
  }
  wtEl.dataset.unit = unit;
}
// Force EVERY baggage control to the same unit, converting each weight, then re-sync
// the COMMS and ticketing composers + preview. Guarded against re-entry.
function _bagSyncAllUnits(unit) {
  if (window._bagUnitSyncing) return;
  window._bagUnitSyncing = true;
  try {
    _ALL_BAG_CTRLS.forEach(function(c){
      var sel = document.getElementById(c.unit);
      var wt  = document.getElementById(c.wt);
      if (sel && sel.value !== unit) sel.value = unit;
      _convertWtEl(wt, unit);
    });
    // Recompose hidden fields / preview for both panels (only the ones present).
    if (document.getElementById('cm-cabin')) { try { _commsBagSync('cm-cabin','cm-cabin'); } catch(e){} }
    if (document.getElementById('cm-chk'))   { try { _commsBagSync('cm-hold','cm-chk'); } catch(e){} }
    if (document.getElementById('bl-bags-global')) { try { _blBagSync(); } catch(e){} }
  } finally {
    window._bagUnitSyncing = false;
  }
}
window._bagSyncAllUnits = _bagSyncAllUnits;

function _commsBagUnitChange(prefix, hiddenId) {
  var unit = (document.getElementById(prefix+'-unit')||{}).value || 'kg';
  // Propagate the chosen unit to ALL interconnected controls (incl. this one).
  _bagSyncAllUnits(unit);
}
function _commsCabinSync()      { _commsBagSync('cm-cabin', 'cm-cabin'); }
function _commsCabinUnitChange(){ _commsBagUnitChange('cm-cabin', 'cm-cabin'); }
function _commsHoldSync()       { _commsBagSync('cm-hold', 'cm-chk'); }
function _commsHoldUnitChange() { _commsBagUnitChange('cm-hold', 'cm-chk'); }
window._commsCabinSync = _commsCabinSync; window._commsCabinUnitChange = _commsCabinUnitChange;
window._commsHoldSync = _commsHoldSync;   window._commsHoldUnitChange = _commsHoldUnitChange;

// ── Ticketing-panel baggage (Cabine + Soute) ───────────────────────────────
// Composes the hidden bl-bags-global (Soute franchise, e.g. "1×23 kg") and
// bl-cabin-global (Cabine) from the qty × weight + unit controls, with kg⇄lbs
// conversion. bl-bags-global is kept for backward compatibility (COMMS autofill,
// dossier save, preview all read it).
function _blBagSync() {
  function _compose(prefix){
    var q = (document.getElementById('bl-'+prefix+'-qty')||{}).value || '';
    var w = (document.getElementById('bl-'+prefix+'-wt')||{}).value || '';
    var u = (document.getElementById('bl-'+prefix+'-unit')||{}).value || 'kg';
    return (q||'1') + '×' + (w||'0') + ' ' + u;
  }
  var holdEl  = document.getElementById('bl-bags-global');
  var cabinEl = document.getElementById('bl-cabin-global');
  if (holdEl)  holdEl.value  = _compose('hold');
  if (cabinEl) cabinEl.value = _compose('cabin');
  // Keep the Tarification baggage (which drives the quote / confirmation PDF, i.e.
  // the "itinéraire" output) in sync with the Soute control. The Tarification field
  // is kg-based, so convert from lbs when needed.
  (function(){
    var hq = parseFloat((document.getElementById('bl-hold-qty')||{}).value) || 0;
    var hw = parseFloat((document.getElementById('bl-hold-wt')||{}).value) || 0;
    var hu = (document.getElementById('bl-hold-unit')||{}).value || 'kg';
    var kg = (hu === 'lbs') ? Math.round(hw / 2.20462) : Math.round(hw);
    var tq = document.getElementById('bags-qty');
    var tk = document.getElementById('bags-kg');
    if (tq) tq.value = hq || tq.value;
    if (tk) tk.value = kg || tk.value;
  })();
  try { if (typeof buildPreview === 'function') buildPreview(); } catch(e){}
}
function _blBagUnitChange(prefix) {
  var unit = (document.getElementById('bl-'+prefix+'-unit')||{}).value || 'kg';
  // Propagate the chosen unit to ALL interconnected controls (incl. this one).
  _bagSyncAllUnits(unit);
}
window._blBagSync = _blBagSync;
window._blBagUnitChange = _blBagUnitChange;

// ── Ticketing payment-box controls (per dossier) ───────────────────────────
// "Ne pas afficher la box Stripe" + custom payment link, persisted in
// localStorage keyed by the dossier reference so they survive re-renders.
function _blPaymentCtrlKey() {
  var ref = (document.getElementById('booking-ref') || {}).value
         || (document.getElementById('bl-master-pnr') || {}).value || '_';
  return 'expatur_pay_ctrl_' + String(ref).replace(/[^a-zA-Z0-9]/g,'_');
}
function _blPaymentCtrlSave() {
  try {
    var data = {
      hideStripe: !!(document.getElementById('bl-hide-stripe') || {}).checked,
      customLink: ((document.getElementById('bl-custom-paylink') || {}).value || '').trim()
    };
    localStorage.setItem(_blPaymentCtrlKey(), JSON.stringify(data));
  } catch(e) {}
}
function _blPaymentCtrlLoad() {
  var data = { hideStripe:false, customLink:'' };
  try { data = JSON.parse(localStorage.getItem(_blPaymentCtrlKey()) || 'null') || data; } catch(e) {}
  var cb = document.getElementById('bl-hide-stripe');
  var lk = document.getElementById('bl-custom-paylink');
  if (cb) cb.checked = !!data.hideStripe;
  if (lk) lk.value = data.customLink || '';
}
window._blPaymentCtrlSave = _blPaymentCtrlSave;
window._blPaymentCtrlLoad = _blPaymentCtrlLoad;

// Collapsible left-menu sections. `_commsToggleSection` works for any section.
function _commsToggleSection(bodyId, caretId) {
  var body = document.getElementById(bodyId);
  var caret = document.getElementById(caretId);
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (caret) caret.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
}
window._commsToggleSection = _commsToggleSection;
// Back-compat: intro toggle.
function _commsToggleIntro() { _commsToggleSection('cm-intro-body', 'cm-intro-caret'); }
window._commsToggleIntro = _commsToggleIntro;

function _commsAutofill() {
  function _v(id){ return (document.getElementById(id)||{}).value || ''; }
  // Recipient — client name + email from the quote/client fields
  var cliPrenom = _v('cli-prenom'), cliNom = _v('cli-nom');
  var contactName = (cliPrenom || cliNom) ? (cliPrenom + ' ' + cliNom).trim()
                    : (_v('pax-name-1') || '');
  var contactEmail = _v('cli-email') || _v('client-email') || '';

  // Flights first (needed to map e-tickets/PNRs per leg)
  var legs = (typeof _blGetAllLegs === 'function') ? _blGetAllLegs() : [];
  _commsData.flights = legs;
  // Travel class (for the récapitulatif) — read the on-screen selector, store the
  // localized label resolved at render time.
  _commsData.travelClass = (document.getElementById('travel-class') || {}).value || 'Economy';
  _commsData.tripType = (typeof tripType !== 'undefined') ? tripType : ((legs.length>1) ? 'multicity' : 'oneway');

  // Airline IATA code per leg (from flight number prefix, fallback to logo code)
  function _legAirlineCode(lg){
    var fn = String(lg.fn || ((lg.segments&&lg.segments[0]&&lg.segments[0].fn)||''));
    var m = fn.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])\s*\d+/i);
    if (m) return m[1].toUpperCase();
    if (typeof getAirlineLogoCode==='function') return String(getAirlineLogoCode(lg.airline||'')||'').toUpperCase();
    return '';
  }

  // Bookings: one entry per leg → { code, name, pnr }. De-dupe identical code+pnr.
  var bookings = [], seen = {};
  legs.forEach(function(lg, li){
    var code = _legAirlineCode(lg);
    var name = _commsAirlineName(lg, code);
    var pnr  = _v('bl-leg-'+li+'-pnr') || _v('bl-master-pnr') || _v('bl-pax-0-pnr') || '';
    var key = code + '|' + pnr;
    if (pnr && !seen[key]) { seen[key] = 1; bookings.push({ code: code, name: name, pnr: pnr }); }
  });
  if (!bookings.length) {
    var fallbackPnr = _v('bl-master-pnr') || _v('booking-ref') || '';
    if (fallbackPnr) bookings.push({ code: _legAirlineCode(legs[0]||{}), name: _commsAirlineName(legs[0]||{}, _legAirlineCode(legs[0]||{})), pnr: fallbackPnr });
  }
  _commsData.bookings = bookings;

  // Passengers — collect per-booking e-tickets: { name, type, etkts:[{code,number}] }
  var pax = [];
  var body = document.getElementById('bl-body');
  var nPax = parseInt(body && body.dataset.paxCount) || 0;
  for (var i=0; i<nPax; i++) {
    var nm = (_v('bl-pax-'+i+'-prenom') + ' ' + _v('bl-pax-'+i+'-nom')).trim();
    var etkts = [];
    legs.forEach(function(lg, li){
      var num = _v('bl-pax-'+i+'-etkt-'+li);
      if (num) etkts.push({ code: _legAirlineCode(lg), number: num });
    });
    // Fallback single field
    if (!etkts.length) {
      var single = _v('bl-pax-'+i+'-etkt-0') || _v('bl-pax-'+i+'-etkt') || '';
      if (single) etkts.push({ code: _legAirlineCode(legs[0]||{}), number: single });
    }
    var badge = '';
    try {
      var row = document.querySelector('#bl-pax-'+i+'-nom'); row = row && row.closest('tr');
      var b = row && row.querySelector('.bl-pax-badge');
      if (b) badge = b.textContent.trim();
    } catch(e){}
    pax.push({ name: nm || ('Passager '+(i+1)), type: badge || 'ADT', etkts: etkts });
  }
  _commsData.pax = pax;

  // PNR (master or first leg) and issue date
  var pnr = _v('bl-master-pnr') || _v('bl-leg-0-pnr') || _v('booking-ref') || '';
  var today = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var _EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var issued = pad(today.getDate()) + ' ' + _EN[today.getMonth()] + ' ' + today.getFullYear();

  // Baggage defaults pulled from the TICKETING panel so the three stay in sync:
  //   ticketing Soute  (bl-bags-global)  → COMMS Soute (cm-hold-*) → email "Soute"
  //   ticketing Cabine (bl-cabin-global) → COMMS Cabine (cm-cabin-*) → email "Cabine"
  var bags     = _v('bl-bags-global')  || '1×23 kg';
  var cabinStr = _v('bl-cabin-global') || '1×10 kg';

  // Seed the editable fields
  function _set(id,val){ var e=document.getElementById(id); if(e && (e.value===undefined || e.value==='' || true)) e.value = val; }
  _set('cm-name', contactName);
  _set('cm-email', contactEmail);
  _set('cm-intro', T('cm_intro'));
  // Parse "<qty>x<weight> <unit>" into a {q,w,u} triple.
  function _parseBag(str, dq, dw){
    var m = String(str).match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|lbs)?/i);
    return {
      q: m ? m[1] : dq,
      w: m ? m[2] : dw,
      u: (m && m[3]) ? m[3].toLowerCase() : 'kg'
    };
  }
  // Cabine ← ticketing bl-cabin-global
  (function(){
    var q=document.getElementById('cm-cabin-qty'), w=document.getElementById('cm-cabin-wt'), u=document.getElementById('cm-cabin-unit');
    var b = _parseBag(cabinStr, '1', '10');
    if (q) q.value = b.q;
    if (w) { w.value = b.w; w.dataset.unit = b.u; }
    if (u) u.value = (b.u === 'lbs') ? 'lbs' : 'kg';
    if (typeof _commsCabinSync === 'function') _commsCabinSync();
  })();
  // Soute ← ticketing bl-bags-global
  (function(){
    var q=document.getElementById('cm-hold-qty'), w=document.getElementById('cm-hold-wt'), u=document.getElementById('cm-hold-unit');
    var b = _parseBag(bags, '1', '23');
    if (q) q.value = b.q;
    if (w) { w.value = b.w; w.dataset.unit = b.u; }
    if (u) u.value = (b.u === 'lbs') ? 'lbs' : 'kg';
    if (typeof _commsHoldSync === 'function') _commsHoldSync();
  })();
  _set('cm-ref', pnr);
  _set('cm-issued', issued);

  // Send-mode UI (merge / divide). Only relevant with more than one passenger.
  var perWrap = document.getElementById('cm-perpax-wrap');
  if (perWrap) {
    perWrap.style.display = (pax.length > 1) ? 'block' : 'none';
    var mEl = document.getElementById('cm-merge');  if (mEl) mEl.checked = false;
    var dEl = document.getElementById('cm-divide'); if (dEl) dEl.checked = false;
    var box = document.getElementById('cm-perpax-emails');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  }

  _commsRender();
}
window._commsAutofill = _commsAutofill;

// Build the per-passenger email inputs (used by the "Divide" mode).
function _commsBuildDivideFields() {
  var box = document.getElementById('cm-perpax-emails');
  if (!box) return;
  var pax = _commsData.pax || [];
  box.innerHTML = '<div style="font-size:0.6rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--navy-faint);margin-bottom:0.35rem;">Email par passager</div>'
    + '<div style="font-size:0.6rem;color:var(--navy-soft);margin-bottom:0.4rem;line-height:1.3;">Laisser vide → envoi à l’email client principal.</div>'
    + pax.map(function(p, i){
        var existing = (document.getElementById('cm-pax-email-'+i)||{}).value || '';
        var mainEmail = (document.getElementById('cm-email')||{}).value || '';
        return '<div style="margin-bottom:0.35rem;max-width:100%;">'
          + '<label style="display:block;font-size:0.6rem;color:var(--navy-soft);margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (p.name||('Passager '+(i+1))) + '</label>'
          + '<input id="cm-pax-email-' + i + '" value="' + existing + '" placeholder="' + mainEmail + '" oninput="_commsRender()" style="width:100%;box-sizing:border-box;font-size:0.74rem;padding:0.3rem 0.45rem;border:1px solid var(--border);border-radius:5px;">'
          + '</div>';
      }).join('');
}

// Mutually-exclusive send-mode checkboxes; reveal divide fields when needed.
function _commsOnSendModeChange(which) {
  var mEl = document.getElementById('cm-merge');
  var dEl = document.getElementById('cm-divide');
  if (which === 'merge' && mEl && mEl.checked && dEl) dEl.checked = false;
  if (which === 'divide' && dEl && dEl.checked && mEl) mEl.checked = false;
  var box = document.getElementById('cm-perpax-emails');
  if (dEl && dEl.checked) { _commsBuildDivideFields(); if (box) box.style.display = 'block'; }
  else if (box) { box.style.display = 'none'; }
  _commsRender();
}
window._commsOnSendModeChange = _commsOnSendModeChange;
window._commsBuildDivideFields = _commsBuildDivideFields;

// Format an e-ticket number for display: 3 digits + 10 digits → "XXX-XXXXXXXXXX".
// Exceptions: LATAM (LA) and G3 keep their raw value (alphanumeric / different scheme).
function _commsFmtEtkt(number, code) {
  var c = String(code||'').toUpperCase();
  var raw = String(number||'').trim();
  if (c === 'LA' || c === 'G3') return raw;          // LATAM / GOL exception
  if (/[A-Za-z]/.test(raw)) return raw;              // alphanumeric → leave as-is
  var digits = raw.replace(/\D/g, '');
  if (digits.length >= 13) return digits.slice(0,3) + '-' + digits.slice(3,13);
  if (digits.length > 3)   return digits.slice(0,3) + '-' + digits.slice(3);
  return digits || raw;
}

function _commsFlightCardHTML(lg, idx, total, trip) {
  idx = idx || 0; total = total || 1; trip = trip || 'oneway';
  // Segment label above the card
  var segLabel;
  if (trip === 'multicity' || total > 2) {
    segLabel = T('cm_vol_n') + ' ' + (idx + 1);
  } else if (trip === 'return') {
    segLabel = (idx === 0) ? T('cm_vol_aller') : T('cm_vol_retour');
  } else {
    segLabel = T('cm_vol_aller');
  }
  // Robust 24h HH:MM formatter — independent of language. Handles
  // "YYYY-MM-DD HH:MM", "HH:MM", "H:MM AM/PM", and French "9h25"/"9 heures 25".
  function _t(s){
    s = String(s||'').trim();
    if (!s || s === '—') return '';
    var m = s.match(/\d{4}-\d{2}-\d{2}[\sT](\d{1,2}):(\d{2})/);
    if (m) return ('0'+m[1]).slice(-2)+':'+m[2];
    m = s.match(/^(\d{1,2})\s*h(?:eures?)?\s*(\d{2})?/i);
    if (m) return ('0'+m[1]).slice(-2)+':'+(m[2]||'00');
    m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m){ var h=parseInt(m[1],10), mn=m[2]; if(m[3]){var pm=/pm/i.test(m[3]); if(pm&&h!==12)h+=12; if(!pm&&h===12)h=0;} return ('0'+h).slice(-2)+':'+mn; }
    return (typeof fmtTimeDisplay==='function') ? fmtTimeDisplay(s) : s;
  }
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  // Resolve departure / arrival times with fallbacks: leg-level → first/last segment → raw datetime.
  var segs0 = (lg.segments && lg.segments.length) ? lg.segments : [];
  function _firstNonEmpty(){ for (var i=0;i<arguments.length;i++){ var v=arguments[i]; if(v && v!=='' && v!=='—') return v; } return ''; }
  var depTimeRaw = _firstNonEmpty(lg.depTime, segs0[0] && segs0[0].depTime, lg.rawDepDateTime);
  var arrTimeRaw = _firstNonEmpty(lg.arrTime, segs0.length ? segs0[segs0.length-1].arrTime : '', lg.rawArrDateTime);
  var dep = (lg.depCode||''), arr = (lg.arrCode||'');
  // Next-day arrival detection: how many calendar days after departure does the
  // flight land? Prefer explicit dep/arr dates; fall back to raw datetimes, then
  // to the overnight flag. Produces 0 (same day), 1 (+1j), 2 (+2j), …
  var _arrDayOffset = (function(){
    function _dpart(s){ var m=String(s||'').match(/(\d{4}-\d{2}-\d{2})/); return m?m[1]:''; }
    function _clock(s){ var m=String(s||'').match(/(\d{1,2}):(\d{2})/); return m?(parseInt(m[1],10)*60+parseInt(m[2],10)):NaN; }
    var segs = lg.segments || [];
    var lastSeg = segs.length ? segs[segs.length-1] : null;
    var firstSeg = segs.length ? segs[0] : null;
    // 1) Explicit dep/arr dates (leg-level, then segment-level, then raw datetimes).
    var dD = (lg.depDate && /^\d{4}-\d{2}-\d{2}$/.test(lg.depDate)) ? lg.depDate
           : _dpart(lg.rawDepDateTime) || (firstSeg && _dpart(firstSeg.depTime)) || '';
    var aD = (lg.arrDate && /^\d{4}-\d{2}-\d{2}$/.test(lg.arrDate)) ? lg.arrDate
           : _dpart(lg.rawArrDateTime) || (lastSeg && _dpart(lastSeg.arrTime)) || '';
    if (dD && aD) {
      var diff = Math.round((new Date(aD+'T00:00:00Z') - new Date(dD+'T00:00:00Z')) / 86400000);
      if (!isNaN(diff) && diff > 0) return diff;
      if (!isNaN(diff) && diff === 0 && !lg.overnight) return 0;
    }
    // 2) Overnight flag from the leg or any segment.
    if (lg.overnight || segs.some(function(s){ return s.overnight; })) return 1;
    // 3) Clock rollback: arrival time-of-day earlier than departure time-of-day,
    //    or departure + duration crosses midnight.
    var depC = _clock(firstSeg && firstSeg.depTime) ; if (isNaN(depC)) depC = _clock(lg.depTime);
    var arrC = _clock(lastSeg && lastSeg.arrTime)   ; if (isNaN(arrC)) arrC = _clock(lg.arrTime);
    if (!isNaN(depC) && !isNaN(arrC)) {
      if (arrC < depC) return 1;
      var dm = lg.durMin || lg.totalDuration || 0;
      if (dm > 0 && (depC + dm) >= 24*60) return 1;
    }
    return 0;
  })();
  // Superscript "+Nj" (FR/ES) or "+Nd" (EN) for the arrival time top-right corner.
  var _arrNextDay = '';
  if (_arrDayOffset > 0) {
    var _suffix = (window._pdfLang === 'en' || window._pdfLang === 'es') ? 'd' : 'j';
    _arrNextDay = '<sup style="font-size:9px;font-weight:700;color:#dc2626;vertical-align:super;margin-left:1px;">+' + _arrDayOffset + _suffix + '</sup>';
  }
  // City names for the header line
  var depCity = (typeof _cardCity==='function') ? _cardCity(dep, lg.depName||'') : dep;
  var arrCity = (typeof _cardCity==='function') ? _cardCity(arr, lg.arrName||'') : arr;
  // Airport NAMES (CSV column B) for under the IATA codes
  var depName = (typeof aptLabel==='function') ? aptLabel(dep, lg.depName||'') : (lg.depName||dep);
  var arrName = (typeof aptLabel==='function') ? aptLabel(arr, lg.arrName||'') : (lg.arrName||arr);
  // DD/MM/YYYY date
  var dmy = '';
  if (lg.depDate && /^\d{4}-\d{2}-\d{2}$/.test(lg.depDate)) {
    var p = lg.depDate.split('-');
    if (window._pdfLang === 'en') {
      // English: "04 AUG 2026" (full year)
      var _MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      dmy = p[2] + ' ' + (_MON[parseInt(p[1],10)-1] || p[1]) + ' ' + p[0];
    } else {
      // French & Spanish: "04/08/2026"
      dmy = p[2] + '/' + p[1] + '/' + p[0];
    }
  }
  // Flight duration — use the SerpAPI total duration carried on the leg (NOT a
  // sum of segment durations). Prefer the pre-formatted durStr, else format durMin.
  var dur = '';
  if (lg.durStr) {
    dur = (typeof _locDur === 'function') ? _locDur(lg.durStr) : lg.durStr;
  } else {
    var _dm = lg.durMin || lg.totalDuration || 0;
    if (_dm > 0 && typeof fmtMin === 'function') dur = fmtMin(_dm);
  }
  // Flight number(s) — join multiple flight numbers with a comma, not "+".
  var fnum = lg.fn || ((lg.segments&&lg.segments[0]&&lg.segments[0].fn) || '');
  fnum = String(fnum).replace(/\s*\+\s*/g, ', ');
  // Direct vs connecting badge
  var nSeg = (lg.segments && lg.segments.length) ? lg.segments.length : 1;
  var stops = (typeof lg.stops === 'number') ? lg.stops : (nSeg - 1);
  var isDirect = stops <= 0;
  // Stopover count WITHOUT the "×" cross — "1 escale", "2 escales", …
  var directBadge = isDirect
    ? '<span style="font-size:10px;font-weight:600;color:#16a34a;">'+T('cm_direct')+'</span>'
    : '<span style="font-size:10px;font-weight:600;color:#dc2626;">' + stops + ' ' + (stops>1?T('cm_stops'):T('cm_stop')) + '</span>';
  // When there is EXACTLY ONE stop, show the connection time (HH:MM, from SerpAPI
  // layover data) and the connecting city below the badge, e.g. "01:10 à Zurich".
  var connInfo = '';
  if (stops === 1) {
    var _lay = (lg.layovers && lg.layovers.length) ? lg.layovers[0]
             : (lg.raw && lg.raw.layovers && lg.raw.layovers.length ? lg.raw.layovers[0] : null);
    var _connCode = '', _connMin = 0;
    if (_lay) {
      _connCode = _lay.id || _lay.airport || _lay.code || '';
      _connMin  = parseInt(_lay.duration, 10) || 0;
    }
    // Fall back to the inter-segment airport if no explicit layover object.
    if (!_connCode && lg.segments && lg.segments.length >= 2) {
      _connCode = lg.segments[0].arrCode || lg.segments[0].arr || '';
    }
    var _connHHMM = '';
    if (_connMin > 0) { var _h = Math.floor(_connMin/60), _m = _connMin%60; _connHHMM = ('0'+_h).slice(-2)+':'+('0'+_m).slice(-2); }
    // Show the connection airport's IATA CODE (not the city name).
    var _connLabel = (_connCode || '').toUpperCase();
    var _atWord = (window._pdfLang === 'en') ? 'at' : (window._pdfLang === 'es') ? 'en' : 'à';
    if (_connHHMM || _connLabel) {
      connInfo = '<div style="font-size:9px;color:#94a3b8;margin-top:2px;">'
        + (_connHHMM ? _connHHMM : '')
        + (_connHHMM && _connLabel ? ' ' + _atWord + ' ' : '')
        + (_connLabel ? _esc(_connLabel) : '')
        + '</div>';
    }
  }
  // Airline logo (hosted URL — works in email)
  var logoUrl = (typeof getAirlineLogoUrl==='function') ? getAirlineLogoUrl(lg) : '';
  var logoImg = logoUrl ? '<img src="'+logoUrl+'" alt="" height="22" style="height:22px;width:auto;max-width:96px;max-height:22px;object-fit:contain;display:inline-block;vertical-align:middle;" referrerpolicy="no-referrer">' : '';
  return ''
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;border-collapse:separate;">'
    // Header: "LEG LABEL — DATE" (left, leg label embedded here) + flight number (right)
    +   '<tr><td style="background:#f1f5f9;padding:8px 14px;border-top-left-radius:8px;border-top-right-radius:8px;">'
    +     '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    +       '<td align="left" style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#06203b;">' + _esc(String(segLabel).toUpperCase()) + (dmy ? ' — ' + dmy : '') + '</td>'
    +       '<td align="right" style="font-size:12px;font-weight:600;color:#334155;white-space:nowrap;">' + _esc(fnum) + '</td>'
    +     '</tr></table>'
    +   '</td></tr>'
    // Body: dep (left) | center (airline logo + flight time + badge) | arr (right).
    //   Row 1 = IATA code + airport name ; Row 2 = dep time (left) | duration (center) | arr time (right)
    //   Times enlarged; duration centered between them, same size as the DIRECT/escale badge,
    //   on the same baseline (valign bottom).
    +   '<tr><td style="padding:14px 16px 6px;">'
    +     '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    +       '<tr>'
    +         '<td align="left" valign="top" width="30%">'
    +           '<div style="font-size:22px;font-weight:700;color:#06203b;">' + _esc(dep) + '</div>'
    +           '<div style="font-size:9px;color:#94a3b8;line-height:1.25;">' + _esc(depName) + '</div>'
    +         '</td>'
    +         '<td align="center" valign="middle" width="40%" style="padding:0 6px;">'
    +           '<div style="text-align:center;">' + logoImg + '</div>'
    +           (dur ? '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">' + dur + '</div>' : '')
    +           '<div style="margin-top:3px;">' + directBadge + '</div>'
    +           connInfo
    +         '</td>'
    +         '<td align="right" valign="top" width="30%">'
    +           '<div style="font-size:22px;font-weight:700;color:#06203b;">' + _esc(arr) + '</div>'
    +           '<div style="font-size:9px;color:#94a3b8;line-height:1.25;">' + _esc(arrName) + '</div>'
    +         '</td>'
    +       '</tr>'
    +       '<tr>'
    +         '<td align="left" valign="bottom" style="padding-top:2px;"><div style="font-size:17px;font-weight:600;color:#0f172a;">' + _t(depTimeRaw) + '</div></td>'
    +         '<td></td>'
    +         '<td align="right" valign="bottom" style="padding-top:2px;"><div style="font-size:17px;font-weight:600;color:#0f172a;white-space:nowrap;">' + _t(arrTimeRaw) + _arrNextDay + '</div></td>'
    +       '</tr>'
    +     '</table>'
    +   '</td></tr>'
    + '</table>';
}

// ── Gmail email markup: schema.org FlightReservation (JSON-LD) ──────────────
// Gmail renders a rich flight card from this structured data. Invisible to the
// reader. Shows for the recipient only once the sender domain is registered
// with Google (self-tests to your own address work without registration).
function _commsTimeHHMM(v){ var m=String(v||'').match(/(\d{1,2}):(\d{2})/); return m ? (('0'+m[1]).slice(-2)+':'+m[2]) : ''; }
function _commsDatePart(v){ var m=String(v||'').match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }
function _commsIso(dateStr, timeVal){
  var d = _commsDatePart(timeVal) || dateStr || '';
  var t = _commsTimeHHMM(timeVal);
  return (d && t) ? (d + 'T' + t + ':00') : '';
}
// Build the UTC-offset suffix (e.g. "+02:00", "-04:00") for an airport on a date,
// reusing the app's DST-aware timezone resolver. Falls back to no suffix if unknown.
function _commsTzSuffix(airportCode, dateStr) {
  try {
    if (typeof _getAirportTZ !== 'function' || typeof _tzOffset !== 'function' || !dateStr) return '';
    var tz = _getAirportTZ((airportCode||'').toUpperCase());
    if (!tz) return '';
    var off = _tzOffset(tz, dateStr);            // hours, may be fractional (e.g. 5.5)
    if (off == null || isNaN(off)) return '';
    var sign = off < 0 ? '-' : '+';
    var abs = Math.abs(off);
    var hh = Math.floor(abs);
    var mm = Math.round((abs - hh) * 60);
    var pad = function(n){ return ('0'+n).slice(-2); };
    return sign + pad(hh) + ':' + pad(mm);
  } catch(e) { return ''; }
}
// ISO datetime WITH timezone offset for the given airport/date (for JSON-LD).
function _commsIsoTz(dateStr, timeVal, airportCode) {
  var iso = _commsIso(dateStr, timeVal);
  if (!iso) return '';
  var datePart = iso.slice(0,10);
  return iso + _commsTzSuffix(airportCode, datePart);
}
function _commsBuildJsonLd(paxList) {
  var legs = _commsData.flights || [];
  var bookings = _commsData.bookings || [];
  if (!legs.length || !paxList.length) return '';
  var out = [];
  paxList.forEach(function(p){
    legs.forEach(function(lg, li){
      var fn = lg.fn || (lg.segments && lg.segments[0] && lg.segments[0].fn) || '';
      var m = String(fn).match(/^([A-Z][A-Z0-9]|[0-9][A-Z])\s*(\d+)/i);
      var aCode = m ? m[1].toUpperCase() : '';
      var flightNum = m ? m[2] : String(fn).replace(/\D/g,'');
      var aName = (typeof _commsAirlineName==='function') ? _commsAirlineName(lg, aCode) : (lg.airline || aCode);
      var pnr = (bookings[li] && bookings[li].pnr) || (bookings[0] && bookings[0].pnr) || '';
      // e-ticket for this passenger on this leg (match by airline code, else positional)
      var etkt = '';
      (p.etkts||[]).forEach(function(e){ if (!etkt && e.code === aCode) etkt = e.number; });
      if (!etkt && p.etkts && p.etkts[li]) etkt = p.etkts[li].number;
      var depIso = _commsIsoTz(lg.depDate, lg.depTime, lg.depCode);
      // Arrival date: prefer leg.arrDate / a date embedded in arrTime, else dep date (+1 if clock rolls back)
      var arrDateBase = lg.arrDate || _commsDatePart(lg.arrTime) || lg.depDate || '';
      var depHHMM = _commsTimeHHMM(lg.depTime), arrHHMM = _commsTimeHHMM(lg.arrTime);
      if (!lg.arrDate && !_commsDatePart(lg.arrTime) && depHHMM && arrHHMM &&
          parseInt(arrHHMM.replace(':',''),10) < parseInt(depHHMM.replace(':',''),10)) {
        try { var _d = new Date(lg.depDate + 'T00:00:00'); _d.setDate(_d.getDate()+1); arrDateBase = _d.toISOString().slice(0,10); } catch(e){}
      }
      var arrIso = (arrDateBase && arrHHMM) ? (arrDateBase + 'T' + arrHHMM + ':00' + _commsTzSuffix(lg.arrCode, arrDateBase)) : '';
      var resv = {
        "@context": "http://schema.org",
        "@type": "FlightReservation",
        "reservationId": pnr || undefined,
        "reservationStatus": "http://schema.org/ReservationConfirmed",
        "underName": { "@type": "Person", "name": p.name || '' },
        "reservationFor": {
          "@type": "Flight",
          "flightNumber": flightNum || undefined,
          "provider": { "@type": "Airline", "name": aName || undefined, "iataCode": aCode || undefined },
          "departureAirport": { "@type": "Airport", "name": (lg.depName || lg.depCode || ''), "iataCode": lg.depCode || '' },
          "departureTime": depIso || undefined,
          "arrivalAirport": { "@type": "Airport", "name": (lg.arrName || lg.arrCode || ''), "iataCode": lg.arrCode || '' },
          "arrivalTime": arrIso || undefined
        }
      };
      if (etkt) resv.reservedTicket = { "@type": "Ticket", "ticketNumber": etkt };
      out.push(resv);
    });
  });
  if (!out.length) return '';
  // Serialize; prevent any closing-tag breakout inside string values.
  var json = JSON.stringify(out.length === 1 ? out[0] : out).replace(/<\//g, '<\\/');
  // Build the tag without a literal closing script tag in our source (which
  // would otherwise terminate THIS inline script early in the browser).
  var open = '<' + 'script type="application/ld+json">';
  var close = '<' + '/script>';
  return open + json + close;
}

function _commsBuildEmailHTML(opts) {
  opts = opts || {};
  function _g(id){ return (document.getElementById(id)||{}).value || ''; }
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var name = _g('cm-name'), email = _g('cm-email'), intro = _g('cm-intro');
  var cabin = _g('cm-cabin'), chk = _g('cm-chk'), ref = _g('cm-ref'), issued = _g('cm-issued');
  // Baggage allowance suffix rule (email):
  //   • Show "/pers" (FR/ES) or "/pax" (EN) ONLY when "Fusionner l'email" is checked
  //     (one merged email covering all passengers).
  //   • In every other case — single passenger, default per-pax sending, or divide —
  //     each email represents one passenger, so NO suffix is shown.
  // The stored value may already carry a suffix from the input sync — strip first.
  (function(){
    var totalPax = (_commsData.pax || []).length;
    var lang = window._pdfLang || 'fr';
    var mergeOn = !!(document.getElementById('cm-merge') && document.getElementById('cm-merge').checked && totalPax > 1);
    function _applySuffix(v){
      var base = String(v||'').replace(/\s*\/\s*(pers|pax)\s*$/i, '').trim();
      if (!base) return base;
      if (!mergeOn) return base;                      // only merged email gets a suffix
      var suf = (lang === 'en') ? '/pax' : '/pers';   // EN → /pax ; FR & ES → /pers
      return base + ' ' + suf;
    }
    cabin = _applySuffix(cabin);
    chk   = _applySuffix(chk);
  })();

  // Single-passenger mode (one email per passenger): greeting + pax list use only this passenger.
  var paxList = _commsData.pax || [];
  var recipientLabel = email;   // Destinataire value shown in the recap
  if (opts.onlyPax) {
    paxList = [opts.onlyPax];
    name = opts.onlyPax.name || name;   // body greeting becomes the passenger's own name
    if (opts.email) email = opts.email;
    recipientLabel = opts.onlyPax.name || email;  // Destinataire = concerned passenger's name
  }

  var flightsHTML = (_commsData.flights||[]).map(function(lg,idx){ return _commsFlightCardHTML(lg, idx, (_commsData.flights||[]).length, _commsData.tripType); }).join('');
  if (!flightsHTML) flightsHTML = '<div style="padding:14px;font-size:12px;color:#94a3b8;">Aucun vol sélectionné.</div>';

  var paxHTML = paxList.map(function(p){
    var ini = String(p.name||'').trim().split(/\s+/).map(function(w){return w[0]||'';}).slice(0,2).join('').toUpperCase();
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #f1f5f9;"><tr>'
      + '<td valign="middle" width="42" style="padding:10px 0 10px 14px;"><div style="width:32px;height:32px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;text-align:center;line-height:32px;">' + _esc(ini) + '</div></td>'
      + '<td align="left" valign="middle" style="padding:10px 8px;"><div style="font-size:13px;font-weight:500;color:#0f172a;">' + _esc(p.name) + '</div>'
      +   (function(){
            var ets = p.etkts || [];
            // Same font as the rest of the template (inherit), bold — except the
            // "/XX" airline code segment in the multiple-booking case, which is NOT bold.
            var base = 'font-size:11px;color:#475569;margin-top:1px;';
            if (!ets.length) return '<div style="'+base+'"><strong>ETKT —</strong></div></td>';
            if (ets.length === 1) {
              return '<div style="'+base+'"><strong>ETKT ' + _esc(_commsFmtEtkt(ets[0].number, ets[0].code)) + '</strong></div></td>';
            }
            return '<div style="'+base+'line-height:1.55;">' +
              ets.map(function(e){
                return '<strong>ETKT</strong>'
                  + '<span style="font-weight:400;">/' + _esc(e.code) + '</span>'
                  + ' <strong>' + _esc(_commsFmtEtkt(e.number, e.code)) + '</strong>';
              }).join('<br>') + '</div></td>';
          })()
      + '<td align="right" valign="middle" style="padding:10px 14px 10px 8px;white-space:nowrap;">'
      +   '<span style="display:inline-block;font-size:10px;padding:2px 8px;border-radius:99px;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">' + _esc(p.type) + '</span>'
      +   '<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:700;letter-spacing:.04em;color:#16a34a;">' + T('cm_confirmed') + '</span>'
      + '</td>'
      + '</tr></table>';
  }).join('');
  if (!paxHTML) paxHTML = '<div style="padding:14px;font-size:12px;color:#94a3b8;">Aucun passager.</div>';

  return ''
    // Gmail email-markup (schema.org FlightReservation) — renders the flight card
    + _commsBuildJsonLd(paxList)
    // Mobile responsiveness — reduce padding so the email fills the screen width.
    + '<' + 'style>@media only screen and (max-width:600px){'
    +   '.cm-wrap{width:100%!important;max-width:100%!important;margin:0!important;}'
    +   '.cm-head{padding:0!important;}'
    +   '.cm-body{padding:0!important;}'
    +   '.cm-sec{margin-bottom:0!important;}'
    + '}<' + '/style>'
    // Responsive outer wrapper — fluid width, capped at 600px, centered
    + '<div class="cm-wrap" style="width:100%;max-width:600px;margin:0 auto;background:#fff;">'
    + '<div class="cm-head" style="background:#00285a;padding:18px 20px;">'
    +   '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    +     '<td align="left" valign="middle"><img src="cid:expatur_title" alt="'+T('cm_header_sub')+'" height="15" style="height:15px;width:auto;display:inline-block;"></td>'
    +     '<td align="right" valign="middle"><img src="cid:expatur_logo_white" alt="Expatur Travel" width="200" style="height:auto;width:200px;max-width:62%;display:inline-block;"></td>'
    +   '</tr></table>'
    + '</div>'
    + '<div class="cm-body" style="padding:18px 20px;font-size:13px;color:#0f172a;">'
    +   '<p style="font-size:14px;color:#06203b;font-weight:600;margin:0 0 8px;">' + _esc(name) + ',</p>'
    +   '<p style="font-size:13px;color:#334155;margin:0 0 16px;line-height:1.65;">' + _esc(intro) + '</p>'
    +   '<p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 12px;">'+T('cm_flight_details')+'</p>'
    +   flightsHTML
    +   '<p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 6px;">'+ (paxList.length === 1 ? T('passengers_one') : T('passengers')) +'</p>'
    +   '<div style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;overflow:hidden;">' + paxHTML + '</div>'
    +   '<p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 6px;">'+T('cm_baggage')+'</p>'
    +   '<div style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;overflow:hidden;">'
    +     '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    +       '<tr style="border-bottom:1px solid #f1f5f9;"><td align="left" style="padding:9px 14px;font-size:12px;color:#475569;">'+T('cm_cabin')+'</td><td align="right" style="padding:9px 14px;font-size:12px;font-weight:700;color:#0f172a;">' + _esc(cabin) + '</td></tr>'
    +       '<tr><td align="left" style="padding:9px 14px;font-size:12px;color:#475569;">'+T('cm_hold')+'</td><td align="right" style="padding:9px 14px;font-size:12px;font-weight:700;color:#0f172a;">' + _esc(chk) + '</td></tr>'
    +     '</table>'
    +   '</div>'
    +   '<p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 6px;">'+T('cm_recap')+'</p>'
    +   '<div style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;overflow:hidden;">'
    +     '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    +       (function(){
            var bks = _commsData.bookings || [];
            if (!bks.length) {
              return '<tr style="border-bottom:1px solid #f1f5f9;"><td align="left" style="padding:8px 14px;font-size:12px;color:#475569;">'+T('cm_ref_label')+'</td><td align="right" style="padding:8px 14px;font-size:12px;font-weight:700;letter-spacing:.06em;color:#0f172a;">' + _esc(ref) + '</td></tr>';
            }
            return bks.map(function(b){
              var lbl = T('cm_ref_label') + (b.name ? ' ' + b.name : (b.code ? ' ' + b.code : ''));
              return '<tr style="border-bottom:1px solid #f1f5f9;"><td align="left" style="padding:8px 14px;font-size:12px;color:#475569;">' + _esc(lbl) + '</td><td align="right" style="padding:8px 14px;font-size:12px;font-weight:700;letter-spacing:.06em;color:#0f172a;">' + _esc(b.pnr) + '</td></tr>';
            }).join('');
          })()
    +       (function(){
            var _cls = _commsData.travelClass || '';
            if (!_cls) return '';
            var _clsLabel = (typeof _classLabel === 'function') ? _classLabel(_cls) : _cls;
            return '<tr style="border-bottom:1px solid #f1f5f9;"><td align="left" style="padding:8px 14px;font-size:12px;color:#475569;">'+T('travel_class')+'</td><td align="right" style="padding:8px 14px;font-size:12px;font-weight:500;color:#0f172a;">' + _esc(_clsLabel) + '</td></tr>';
          })()
    +       '<tr style="border-bottom:1px solid #f1f5f9;"><td align="left" style="padding:8px 14px;font-size:12px;color:#475569;">'+T('cm_recipient')+'</td><td align="right" style="padding:8px 14px;font-size:12px;font-weight:500;color:#0f172a;">' + _esc(recipientLabel) + '</td></tr>'
    +       '<tr style="border-bottom:1px solid #f1f5f9;"><td align="left" style="padding:8px 14px;font-size:12px;color:#475569;">'+T('issued_on')+'</td><td align="right" style="padding:8px 14px;font-size:12px;font-weight:500;color:#0f172a;">' + _esc(issued) + '</td></tr>'
    +       (paxList.length > 1 ? '<tr><td align="left" style="padding:8px 14px;font-size:12px;color:#475569;">'+T('cm_pax_count')+'</td><td align="right" style="padding:8px 14px;font-size:12px;font-weight:500;color:#0f172a;">' + paxList.length + '</td></tr>' : '')
    +     '</table>'
    +   '</div>'
    +   '<div style="text-align:center;font-size:12px;color:#64748b;line-height:1.4;">'
    +     '<div>' + T('cm_help') + ' <a href="mailto:administration@expaturtravel.com" style="color:#06203b;text-decoration:underline;">administration@expaturtravel.com</a></div>'
    +     '<div style="margin-top:10px;">'
    +       '<a href="https://wa.me/33643199776" target="_blank" style="color:#06203b;text-decoration:none;white-space:nowrap;font-size:12px;">+33 6 43 19 97 76</a>'
    +     '</div>'
    +     '<div style="margin-top:6px;text-align:center;">'
    +       '<a href="https://wa.me/33643199776" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;margin:0 6px;vertical-align:middle;">'
    +         '<img src="cid:expatur_whatsapp" alt="WhatsApp" width="16" height="16" style="width:16px;height:16px;display:inline-block;border:0;vertical-align:middle;">'
    +       '</a>'
    +       '<a href="https://www.instagram.com/expatur" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;margin:0 6px;vertical-align:middle;">'
    +         '<img src="cid:expatur_instagram" alt="Instagram" width="16" height="16" style="width:16px;height:16px;display:inline-block;border:0;vertical-align:middle;">'
    +       '</a>'
    +       '<a href="https://www.linkedin.com/company/expaturtravel" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;margin:0 6px;vertical-align:middle;">'
    +         '<img src="cid:expatur_linkedin" alt="LinkedIn" width="16" height="16" style="width:16px;height:16px;display:inline-block;border:0;vertical-align:middle;">'
    +       '</a>'
    +       '<a href="https://www.facebook.com/expaturtravel" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;margin:0 6px;vertical-align:middle;">'
    +         '<img src="cid:expatur_facebook" alt="Facebook" width="16" height="16" style="width:16px;height:16px;display:inline-block;border:0;vertical-align:middle;">'
    +       '</a>'
    +     '</div>'
    +   '</div>'
    +   '<div style="text-align:center;margin-top:16px;">'
    +     '<a href="https://www.expaturtravel.com" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">'
    +       '<img src="cid:expatur_icon" alt="Expatur" width="40" style="height:40px;width:auto;display:inline-block;border:0;">'
    +     '</a>'
    +     '<div style="font-size:10px;color:#94a3b8;margin-top:8px;letter-spacing:.04em;">'+T('cm_rights')+'</div>'
    +   '</div>'
    + '</div>'   // close content padding div
    + '</div>';  // close responsive wrapper
}
window._commsBuildEmailHTML = _commsBuildEmailHTML;

function _commsRender() {
  var prev = document.getElementById('cm-preview');
  if (!prev) return;
  var nPax = (_commsData.pax||[]).length;
  var mergeOn  = !!(document.getElementById('cm-merge')  && document.getElementById('cm-merge').checked  && nPax > 1);
  var divideOn = !!(document.getElementById('cm-divide') && document.getElementById('cm-divide').checked && nPax > 1);
  // Default (no checkbox) and Divide both send one email per passenger →
  // preview the FIRST passenger's individual email. Merge previews all passengers.
  var perPax = (nPax > 1) && !mergeOn;

  var emailsBox = document.getElementById('cm-perpax-emails');
  if (emailsBox) emailsBox.style.display = divideOn ? 'block' : 'none';

  var opts = {};
  if (perPax && _commsData.pax && _commsData.pax.length) {
    opts.onlyPax = _commsData.pax[0];
    // Recipient for the previewed passenger: divide → their field (or main); else main email.
    var mainEmail = (document.getElementById('cm-email')||{}).value || '';
    if (divideOn) {
      var v = (document.getElementById('cm-pax-email-0')||{}).value || '';
      opts.email = (v && v.indexOf('@') > -1) ? v : mainEmail;
    } else {
      opts.email = mainEmail;
    }
  }
  var html = _commsBuildEmailHTML(opts);
  // For the on-screen preview, replace cid: image refs with base64 data URIs.
  var _titleB64 = (window._pdfLang === 'en') ? EXPATUR_TITLE_EN_PNG_B64 : EXPATUR_TITLE_FR_PNG_B64;
  html = html
    .replace(/cid:expatur_logo_white/g, 'data:image/png;base64,' + EXPATUR_LOGO_WHITE_PNG_B64)
    .replace(/cid:expatur_icon/g,       'data:image/png;base64,' + EXPATUR_ICON_COLOR_PNG_B64)
    .replace(/cid:expatur_whatsapp/g,   'data:image/png;base64,' + EXPATUR_WHATSAPP_PNG_B64)
    .replace(/cid:expatur_instagram/g,  'data:image/png;base64,' + EXPATUR_INSTAGRAM_PNG_B64)
    .replace(/cid:expatur_linkedin/g,   'data:image/png;base64,' + EXPATUR_LINKEDIN_PNG_B64)
    .replace(/cid:expatur_facebook/g,   'data:image/png;base64,' + EXPATUR_FACEBOOK_PNG_B64)
    .replace(/cid:expatur_title/g,      'data:image/png;base64,' + _titleB64);
  prev.innerHTML = html;
}
window._commsRender = _commsRender;

// COMMS language switch — sets the PDF/email language, retranslates the static
// intro (unless the agent has manually edited it), updates the toggle highlight,
// and re-renders the live preview. The PDF generated on send uses this same _pdfLang.
function _commsSetLang(lang) {
  var prevLang = window._pdfLang || 'fr';
  var newLang = (lang === 'en') ? 'en' : (lang === 'es') ? 'es' : 'fr';
  // If the intro still matches the previous language's default, swap it to the new one.
  var introEl = document.getElementById('cm-intro');
  if (introEl) {
    var prevDefault = (typeof T === 'function') ? T('cm_intro', prevLang) : '';
    if (!introEl.value || introEl.value.trim() === String(prevDefault).trim()) {
      window._pdfLang = newLang;
      introEl.value = T('cm_intro');
    }
  }
  window._pdfLang = newLang;
  // Update toggle button highlight (inline styles, guaranteed)
  document.querySelectorAll('.cm-lang-btn').forEach(function(b){
    var on = (b.dataset.lang === newLang);
    b.classList.toggle('active', on);
    b.style.background = on ? '#06203b' : '#ffffff';
    b.style.color = on ? '#ffffff' : '#06203b';
  });
  _commsRender();
}
window._commsSetLang = _commsSetLang;

// Convert a Blob to a base64 string (no data: prefix)
function _blobToBase64(blob) {
  return new Promise(function(resolve, reject){
    var r = new FileReader();
    r.onload = function(){ var s = String(r.result||''); var i = s.indexOf(','); resolve(i>=0 ? s.slice(i+1) : s); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// SEND — generates the confirmation PDF(s), attaches them, and emails via the server.
//
// Three modes (multi-passenger):
//   • Default (no checkbox): one email PER passenger to the MAIN client email,
//       each containing only that passenger's info + only that passenger's PDF.
//   • Merge  (cm-merge):     ONE email to the main client email with ALL passengers
//       and ALL their PDFs attached.
//   • Divide (cm-divide):    one email per passenger; recipient = that passenger's
//       edited field, or the main client email when the field is left blank.
// Single passenger always sends one email to the main client email.
// `_commsSend` (Task 3) is intentionally NOT defined here.
