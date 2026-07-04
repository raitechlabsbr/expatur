// ═══════════════════════════════════════════════════════════════════════════
// Recap — relatório de reservas (Bookings). Port fiel de docs/monolito.html,
// IIFE principal do Recap (linhas ~75986–76434) + os handlers de menu
// (_recapMenuToggle/_recapMenuClose, originalmente num <script> separado do
// monólito em ~77828–77836, porque ali também vivia o import CSV — fora de
// escopo — mas o toggle/close do menu ⋮ é indispensável para as colunas
// configuráveis desta task, então foram trazidos para dentro deste IIFE).
//
// DROP integral do plumbing Cloudflare/D1 (Worker API + token/header, envio e
// carga das linhas via rede, sincronização de preferências de coluna via
// nuvem, resync manual, cache cross-device de reservas e a normalização de
// custos/legs/trip-type para o payload) e do import de dossiê via CSV (parser
// + input de arquivo do menu) — nenhuma chamada de rede. O relatório deriva
// 100% dos dossiês/billets/P&L
// já persistidos em localStorage pela própria plataforma (ver Step 3 do
// report: _pnlOf(ref) lê 'expatur_pnl_'+ref, a mesma chave gravada por
// app.js). Bulk Edit (Task 2) ainda não existe — o guard `&&` no botão
// "Sélection multiple" evita erro enquanto o handler não chega.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  if (window._recapInit) return; window._recapInit = true;
  if (typeof window.__RECAP_ENABLED === 'undefined') window.__RECAP_ENABLED = true;  /* feature flag */

  function _esc(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  var MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function _fmtDate(d){ if (!(d instanceof Date) || isNaN(d.getTime()) || d.getTime()===0) return '—'; return ('0'+d.getDate()).slice(-2)+' '+MON[d.getMonth()]+' '+d.getFullYear(); }
  function _iata(fn){ var s=String(fn||'').toUpperCase(); var m=s.match(/^([A-Z]{1,3})\s*\d/); if (m) return m[1]; var m2=s.match(/\b([A-Z]{2})\b/); return m2?m2[1]:''; }

  /* index the existing booking records: ref→data, pnr→ref, ref→bookedAt */
  function _index(){
    var refToData={}, pnrToRef={}, refToBooked={}, list=[];
    try { list = JSON.parse(localStorage.getItem('expatur_dossier_list')||'[]'); } catch(e){}
    (list||[]).forEach(function(d){
      var data=null; try { data=JSON.parse(localStorage.getItem('expatur_dossier_'+d.id)||'null'); } catch(e){}
      if (!data) return;
      var ref=(data.fields && data.fields['booking-ref']) || d.label || '';
      if (!ref) return;
      refToData[ref]=data;
      try { var ba=localStorage.getItem('expatur_bookedAt_'+ref); if (ba) refToBooked[ref]=ba; } catch(e){}
      try {
        var bk=localStorage.getItem('expatur_billet_'+ref.replace(/[^a-zA-Z0-9]/g,'_'));
        if (bk){ var b=JSON.parse(bk); var pnrs=[]; if (b.masterPnr) pnrs.push(b.masterPnr); (b.legs||[]).forEach(function(l){ if (l.pnr) pnrs.push(l.pnr); });
          pnrs.forEach(function(p){ if (p) pnrToRef[String(p).trim().toUpperCase()]=ref; }); }
      } catch(e){}
    });
    return { refToData:refToData, pnrToRef:pnrToRef, refToBooked:refToBooked };
  }

  function _deriveType(legs){
    var n=legs.length;
    if (n<=1) return 'One Way';
    if (n===2){
      var a=legs[0], b=legs[1];
      if (a.arr&&b.dep&&a.dep&&b.arr&&a.arr===b.dep&&b.arr===a.dep) return 'Round Trip';
      var back=(b.arr&&a.dep&&b.arr===a.dep), out=(a.arr&&b.dep&&a.arr===b.dep);
      if ((back&&!out)||(out&&!back)) return 'Open Jaw';
      return 'Multi-City';
    }
    return 'Multi-City';
  }
  function _type(data, legs){
    if (data && data.tripType){ if (data.tripType==='return') return 'Round Trip'; if (data.tripType==='multicity') return 'Multi-City'; if (data.tripType==='oneway') return 'One Way'; }
    return _deriveType(legs);
  }

  /* ── booking-driven helpers (dossier + billet + bookedAt, per the field map) ── */
  function _billet(ref){ try { return JSON.parse(localStorage.getItem('expatur_billet_'+String(ref).replace(/[^a-zA-Z0-9]/g,'_'))||'null'); } catch(e){ return null; } }
  function _issued(ref){ try { return localStorage.getItem('billetFrozen_'+ref)==='1'; } catch(e){ return false; } }

  /* Legs from the dossier itinerary (reliable IATA): leg1 = dep1→arr1, return adds
     the inbound, multicity appends multiLegs. */
  function _legsOf(data){
    var f=data.fields||{}, tt=data.tripType||'oneway', legs=[];
    var d1=(f['dep1']||'').toUpperCase(), a1=(f['arr1']||'').toUpperCase();
    if (tt==='multicity'){
      if (d1||a1) legs.push({dep:d1,arr:a1});
      (data.multiLegs||[]).forEach(function(l){ var dd=(l.dep||'').toUpperCase(), aa=(l.arr||'').toUpperCase(); if(dd||aa) legs.push({dep:dd,arr:aa}); });
    } else if (tt==='return'){
      if (d1||a1){ legs.push({dep:d1,arr:a1}); legs.push({dep:(f['dep2']||a1).toUpperCase(), arr:(f['arr2']||d1).toUpperCase()}); }
    } else {
      if (d1||a1) legs.push({dep:d1,arr:a1});
    }
    return legs;
  }

  /* Flight type from tripType, with Open Jaw inferred when a "return" doesn't reverse. */
  function _typeLabel(data, legs){
    var tt=data.tripType||'oneway';
    if (tt==='multicity') return 'Multi-City';
    if (tt==='return'){
      if (legs.length>=2){ var a=legs[0], b=legs[1]; if (!(a.arr&&b.dep&&a.dep&&b.arr&&a.arr===b.dep&&b.arr===a.dep)) return 'Open Jaw'; }
      return 'Round Trip';
    }
    return 'One Way';
  }

  /* PNRs from the billet: masterPnr (single) or per-leg pnr (multi-city); airline from
     the matching leg. Falls back to passenger-level PNRs. Returns [{airline,pnr}]. */
  function _pnrsOf(ref){
    var out=[], seen={};
    function add(air, pnr){ if(!pnr) return; pnr=String(pnr).trim().toUpperCase(); if(!pnr) return; var k=(air||'')+'|'+pnr; if(seen[k]) return; seen[k]=1; out.push({airline:air||'', pnr:pnr}); }
    var bk=_billet(ref);
    if (bk){
      /* SINGLE SOURCE: the PNR shown next to the ETKT in Ticketing (billet pax records).
         Never from suppliers / financial / cache / dossier metadata / derived tables. */
      (bk.pax||[]).forEach(function(p){ if (p.pnr) add('', p.pnr); });
      /* Fallback to the ticketing leg / master PNR only when no pax-level PNR exists. */
      if (!out.length){
        if (bk.isMC){ (bk.legs||[]).forEach(function(l){ if (l.pnr) add(_iata(l.airline||l.fn), l.pnr); }); }
        else if (bk.masterPnr){ var l0=(bk.legs&&bk.legs[0])||{}; add(_iata(l0.airline||l0.fn), bk.masterPnr); }
      }
    }
    return out;
  }

  /* Booking date: expatur_bookedAt_<ref> (ISO), else the billet savedAt. */
  function _bookDate(ref){
    var ba=null; try { ba=localStorage.getItem('expatur_bookedAt_'+ref); } catch(e){}
    if (ba){ var x=new Date(ba); if(!isNaN(x.getTime())) return x; }
    var bk=_billet(ref);
    if (bk&&bk.savedAt){ var y=new Date(bk.savedAt); if(!isNaN(y.getTime())) return y; }
    return null;
  }

  /* Passenger name: reuse the existing _diPaxName, else dossier fields/paxRows. */
  function _paxName(data){
    try { if (typeof window._diPaxName==='function'){ var n=window._diPaxName(data); if (n&&n!=='—') return n; } } catch(e){}
    var f=data.fields||{};
    if ((f['pax-name-1']||'').trim()) return f['pax-name-1'].trim();
    if (data.paxRows&&data.paxRows.length&&data.paxRows[0].name) return data.paxRows[0].name;
    return '—';
  }

  function _pnlOf(ref){ try { return JSON.parse(localStorage.getItem('expatur_pnl_'+ref)||'null'); } catch(e){ return null; } }
  function _numBR(v){ if (typeof v==='number') return isNaN(v)?null:v; var n=parseFloat(String(v==null?'':v).replace(/[^\d.,-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.')); return isNaN(n)?null:n; }
  function _brlR(n){ n=parseFloat(n); if (isNaN(n)) return '—'; return 'R$ '+n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function _fmtDMY(d){ if (!(d instanceof Date)||isNaN(d.getTime())||d.getTime()===0) return '—'; return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear(); }
  function _paxCountOf(data, bk){ if (bk&&bk.pax&&bk.pax.length) return bk.pax.length; var pr=((data&&data.paxRows)||[]).filter(function(x){ return (x.name||'').trim(); }); if (pr.length) return pr.length; var f=(data&&data.fields)||{}; var c=(parseInt(f['pax-adultes'],10)||0)+(parseInt(f['pax-enfants'],10)||0)+(parseInt(f['pax-bebes'],10)||0); return c||1; }
  function _flightTimeOf(bk){ if (!bk||!bk.legs||!bk.legs.length) return '—';
    /* Prefer the flight duration provided by SerpAPI (durMin / durStr / totalDuration)
       rather than recomputing it from clock times. Sum the legs; fall back to a clock
       computation only when no SerpAPI duration is present. */
    function _parseDur(v){ var m=String(v||'').match(/(\d+)\s*h\s*(\d+)?/i); if(m) return (+m[1])*60+(+(m[2]||0)); var m2=String(v||'').match(/^(\d+)\s*min$/i); if(m2) return +m2[1]; return 0; }
    function _legMin(l){ if(typeof l.durMin==='number'&&l.durMin>0) return l.durMin; if(typeof l.totalDuration==='number'&&l.totalDuration>0) return l.totalDuration; var d=_parseDur(l.durStr); if(d>0) return d;
      if(l.segments&&l.segments.length){ var sm=0,ok=false; l.segments.forEach(function(sg){ if(typeof sg.durMin==='number'&&sg.durMin>0){sm+=sg.durMin;ok=true;} else { var sd=_parseDur(sg.durStr); if(sd>0){sm+=sd;ok=true;} } }); if(ok) return sm; }
      return 0; }
    var total=0, have=false; bk.legs.forEach(function(l){ var m=_legMin(l); if(m>0){ total+=m; have=true; } });
    if (have && total>0 && total<1440*7){ var H=Math.floor(total/60), M=total%60; return H+'h'+('0'+M).slice(-2); }
    function dt(ds,hhmm){ if(!hhmm) return null; var hm=String(hhmm).match(/(\d{1,2}):(\d{2})/); if(!hm) return null; var base=ds?Date.parse(ds):NaN; var d=isNaN(base)?new Date(2000,0,1):new Date(base); d.setHours(+hm[1],+hm[2],0,0); return d.getTime(); }
    var a=bk.legs[0], b=bk.legs[bk.legs.length-1];
    var dep=dt(a.depDate||a.date, a.depTime||((a.segments&&a.segments[0]&&a.segments[0].depTime)));
    var arr=dt(b.arrDate||b.depDate||b.date, b.arrTime||((b.segments&&b.segments.length&&b.segments[b.segments.length-1].arrTime)));
    if (dep==null||arr==null) return '—'; var mins=Math.round((arr-dep)/60000); if (mins<=0) mins+=1440; if (mins<=0||mins>1440*5) return '—';
    var h=Math.floor(mins/60), m=mins%60; return h+'h'+('0'+m).slice(-2); }

  /* build recap rows: ONE row per ISSUED booking (dossier), enriched from billet + P&L.
     Bookings ≠ vols — the flight CSV is a derived per-leg projection, not used here. */
  function _build(){
    var list=[]; try { list=JSON.parse(localStorage.getItem('expatur_dossier_list')||'[]'); } catch(e){ list=[]; }
    var out=[];
    (list||[]).forEach(function(d){
      var data=null; try { data=JSON.parse(localStorage.getItem('expatur_dossier_'+d.id)||'null'); } catch(e){}
      if (!data) return;
      var ref=(data.fields&&data.fields['booking-ref'])||d.label||'';
      if (!ref || !_issued(ref)) return;                 /* issued bookings only */
      var legs=_legsOf(data);
      var bd=_bookDate(ref);
      var dv='—'; try { if (typeof window._diDealValue==='function') dv=window._diDealValue(data)||'—'; } catch(e){}
      var _bk=_billet(ref), _pnl=_pnlOf(ref), _pn=_pnrsOf(ref);
      var _l0=(_bk&&_bk.legs&&_bk.legs[0])||null;
      var _air=(_pn[0]&&_pn[0].airline)||(_l0?(_iata(_l0.fn)||_iata(_l0.airline)||String(_l0.airline||'').toUpperCase()):'')||'';
      out.push({ id:d.id, ref:ref, pax:_paxName(data), bookingDate:bd, ms:bd?bd.getTime():0,
                 pnrs:_pn, type:_typeLabel(data,legs), legs:legs, dealValue:dv,
                 paxCount:_paxCountOf(data,_bk), flightTime:_flightTimeOf(_bk), airline:_air,
                 ravBrut:(_pnl&&_pnl.ravBrut!=null)?_numBR(_pnl.ravBrut):null,
                 ravNet:(_pnl&&_pnl.netRAV!=null)?_numBR(_pnl.netRAV):null });
    });
    /* Publish ref→deal-value so the drawer header can fall back to the saved
       value when the local dossier can't be resolved. */
    try { window.__recapDealByRef = window.__recapDealByRef || {};
      out.forEach(function(r){ if(r && r.ref && r.dealValue && r.dealValue!=='—') window.__recapDealByRef[r.ref]=r.dealValue; }); } catch(e){}
    out.sort(function(a,b){ return b.ms-a.ms; });          /* booking date descending */
    return out;
  }

  function _legsHtml(b){
    if (!b.legs.length) return '<span style="color:var(--navy-faint,#8899aa);">—</span>';
    if (b.type==='Multi-City') return b.legs.map(function(l,i){ return '<div>Leg '+(i+1)+': '+_esc(l.dep||'?')+' → '+_esc(l.arr||'?')+'</div>'; }).join('');
    return b.legs.map(function(l){ return '<div>'+_esc(l.dep||'?')+' → '+_esc(l.arr||'?')+'</div>'; }).join('');
  }
  function _pnrHtml(b){
    if (!b.pnrs.length) return '<span style="color:var(--navy-faint,#8899aa);">—</span>';
    return b.pnrs.map(function(p){ return '<div style="white-space:nowrap;">'+(p.airline?('<strong>'+_esc(p.airline)+'</strong> / '):'')+'<span style="font-family:monospace;">'+_esc(p.pnr)+'</span></div>'; }).join('');
  }
  function _pnrPrimary(b){
    if (!b.pnrs.length) return '<span style="color:var(--navy-faint,#8899aa);">—</span>';
    var p=b.pnrs[0], extra=b.pnrs.length-1;
    return '<span style="white-space:nowrap;font-family:monospace;font-weight:700;">'+_esc(p.pnr)+(extra>0?' <span style="font-family:inherit;font-weight:400;color:var(--navy-faint,#8899aa);">(+'+extra+')</span>':'')+'</span>';
  }
  function _paxDisp(b){ var n=(b.paxCount||1)-1; return _esc(b.pax)+(n>0?' (+'+n+')':''); }

  /* Leg column → overall route only: first-leg origin → last-leg final dest. */
  function _legRoute(b){
    var lg=(b&&b.legs)||[]; if(!lg.length) return '—';
    function dep(l){ return String((l&&(l.dep||l.depCode))|| (l&&l.segments&&l.segments[0]&&l.segments[0].depCode) ||'').toUpperCase(); }
    function arr(l){ return String((l&&(l.arr||l.arrCode))|| (l&&l.segments&&l.segments.length&&l.segments[l.segments.length-1].arrCode) ||'').toUpperCase(); }
    var o=dep(lg[0]), d=arr(lg[lg.length-1]);
    return (o||'?')+' → '+(d||'?');
  }

  /* ── Recap column registry (order + visibility are user-configurable) ───────── */
  var RECAP_COL_DEFS = [
    { id:'bookingDate', label:'Booking Date', th:'',                  w:104, cell:function(b){ return '<td style="padding:10px 18px;white-space:nowrap;">'+_fmtDMY(b.bookingDate)+'</td>'; } },
    { id:'ref',         label:'Dossier',      th:'',                  w:92,  cell:function(b){ return '<td style="padding:10px 18px;font-family:monospace;font-weight:700;color:var(--red,#c00);overflow:hidden;text-overflow:ellipsis;">'+_esc(b.ref)+'</td>'; } },
    { id:'dealValue',   label:'Deal Value',   th:'text-align:right;', w:104, cell:function(b){ return '<td style="padding:10px 18px;text-align:right;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_esc(b.dealValue)+'</td>'; } },
    { id:'pax',         label:'Passenger',    th:'',                  w:170, cell:function(b){ return '<td style="padding:10px 18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+_esc(b.pax)+'">'+_paxDisp(b)+'</td>'; } },
    { id:'airline',     label:'Airline',      th:'',                  w:72,  cell:function(b){ return '<td style="padding:10px 18px;white-space:nowrap;font-weight:700;">'+_esc(b.airline||'—')+'</td>'; } },
    { id:'pnr',         label:'PNR',          th:'',                  w:128, cell:function(b){ return '<td style="padding:10px 18px;white-space:nowrap;">'+_pnrPrimary(b)+'</td>'; } },
    { id:'route',       label:'Leg',          th:'',                  w:120, cell:function(b){ return '<td style="padding:10px 18px;white-space:nowrap;font-weight:600;">'+_legRoute(b)+'</td>'; } },
    { id:'ravBrut',     label:'RAV B.',       th:'text-align:right;', w:112, cell:function(b){ return '<td style="padding:10px 18px;text-align:right;font-weight:700;white-space:nowrap;">'+(b.ravBrut!=null?_brlR(b.ravBrut):'—')+'</td>'; } },
    { id:'ravNet',      label:'RAV L.',       th:'text-align:right;', w:112, cell:function(b){ return '<td style="padding:10px 18px;text-align:right;font-weight:700;white-space:nowrap;color:#16a34a;">'+(b.ravNet!=null?_brlR(b.ravNet):'—')+'</td>'; } }
  ];
  var RECAP_COLS_KEY='expatur_recap_cols';
  function _recapColsCfg(){
    var known=RECAP_COL_DEFS.map(function(c){return c.id;});
    var def={order:known.slice(), hidden:[]};
    try{ var sv=JSON.parse(localStorage.getItem(RECAP_COLS_KEY)||'null');
      if(sv&&sv.order){ var order=sv.order.filter(function(id){return known.indexOf(id)>=0;});
        known.forEach(function(id){ if(order.indexOf(id)<0) order.push(id); });
        return {order:order, hidden:(sv.hidden||[]).filter(function(id){return known.indexOf(id)>=0;})}; }
    }catch(e){}
    return def;
  }
  function _recapColsSave(cfg){
    try{ localStorage.setItem(RECAP_COLS_KEY, JSON.stringify(cfg)); }catch(e){}
  }
  function _orderedCols(){
    var cfg=_recapColsCfg(), byId={}; RECAP_COL_DEFS.forEach(function(c){ byId[c.id]=c; });
    return cfg.order.map(function(id){ return byId[id]; }).filter(Boolean)
      .map(function(c){ return { def:c, visible:cfg.hidden.indexOf(c.id)<0 }; });
  }

  function _render(){
    var view=document.getElementById('recap-view'); if (!view) return;
    var rows=_build();
    var ordered=_orderedCols();
    var visCols=ordered.filter(function(o){ return o.visible; });
    var body=rows.length?rows.map(function(b){
      return '<tr class="recap-row" data-ref="'+_esc(b.ref)+'" style="cursor:pointer;border-top:1px solid #eef1f5;">'
        + visCols.map(function(o){ return o.def.cell(b); }).join('')
        + '</tr>';
    }).join(''):'<tr><td colspan="'+visCols.length+'" style="text-align:center;padding:2.5rem;color:var(--navy-faint,#8899aa);">Aucune réservation émise pour le moment.</td></tr>';
    var colgroup='<colgroup>'+visCols.map(function(o){ return '<col style="width:'+o.def.w+'px;">'; }).join('')+'</colgroup>';
    var thead='<thead><tr style="position:sticky;top:0;background:#f5f7fa;z-index:1;text-align:left;color:var(--navy-soft,#3a5068);">'
      + visCols.map(function(o){ return '<th style="padding:11px 18px;'+(o.def.th||'')+'">'+_esc(o.def.label)+'</th>'; }).join('')
      + '</tr></thead>';
    /* Action-menu column manager: per column a show/hide checkbox + reorder arrows. */
    var colMgr=ordered.map(function(o,i){
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 14px;font-size:0.72rem;color:#06203b;">'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;">'
        +   '<input type="checkbox" '+(o.visible?'checked':'')+' onchange="window._recapColToggle('+_jq(o.def.id)+')" style="width:14px;height:14px;cursor:pointer;">'
        +   '<span>'+_esc(o.def.label)+'</span>'
        + '</label>'
        + '<button title="Monter" '+(i===0?'disabled':'')+' onclick="window._recapColMove('+_jq(o.def.id)+',-1)" style="background:#eef2f7;border:1px solid var(--border,#d8dee6);border-radius:4px;cursor:'+(i===0?'default':'pointer')+';color:#06203b;font-size:0.7rem;line-height:1;padding:2px 6px;opacity:'+(i===0?'0.4':'1')+';">↑</button>'
        + '<button title="Descendre" '+(i===ordered.length-1?'disabled':'')+' onclick="window._recapColMove('+_jq(o.def.id)+',1)" style="background:#eef2f7;border:1px solid var(--border,#d8dee6);border-radius:4px;cursor:'+(i===ordered.length-1?'default':'pointer')+';color:#06203b;font-size:0.7rem;line-height:1;padding:2px 6px;opacity:'+(i===ordered.length-1?'0.4':'1')+';">↓</button>'
        + '</div>';
    }).join('');
    var menuOpen=!!window.__recapMenuOpen;
    view.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;padding:0.5rem 0 0.9rem;flex-wrap:wrap;">'
      + '<div class="recap-menu-wrap" style="margin-left:auto;position:relative;">'
      +   '<button onclick="window._recapMenuToggle(event)" title="Actions" aria-label="Actions" style="background:#06203b;color:#fff;border:none;border-radius:6px;font-size:1.05rem;line-height:1;font-weight:700;padding:5px 12px;cursor:pointer;font-family:inherit;">⋮</button>'
      +   '<div id="recap-menu" style="display:'+(menuOpen?'block':'none')+';position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border,#d8dee6);border-radius:8px;box-shadow:0 8px 24px rgba(6,32,59,0.16);z-index:30;min-width:240px;overflow:hidden;max-height:70vh;overflow-y:auto;">'
      +     '<button class="recap-menu-i" onclick="window._recapRender()" style="display:block;width:100%;text-align:left;background:none;border:none;padding:10px 14px;font-size:0.74rem;font-weight:600;color:#06203b;cursor:pointer;font-family:inherit;">↻ Actualiser</button>'
      +     '<button id="recap-bulk-mi" class="recap-menu-i" onclick="window._recapBulkToggle&&window._recapBulkToggle()" style="display:block;width:100%;text-align:left;background:none;border:none;border-top:1px solid #eef1f5;padding:10px 14px;font-size:0.74rem;font-weight:600;color:#06203b;cursor:pointer;font-family:inherit;">'+(window.__recapBulkOn?'✓ Quitter la sélection':'✎ Sélection multiple (Bulk Edit)')+'</button>'
      +     '<div style="border-top:1px solid #eef1f5;padding:9px 14px 4px;font-size:0.64rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--navy-faint,#8899aa);">Colonnes</div>'
      +     colMgr
      +     '<button class="recap-menu-i" onclick="window._recapColsReset()" style="display:block;width:100%;text-align:left;background:none;border:none;border-top:1px solid #eef1f5;padding:9px 14px;font-size:0.7rem;font-weight:600;color:#b91c1c;cursor:pointer;font-family:inherit;">↺ Réinitialiser les colonnes</button>'
      +   '</div>'
      + '</div>'
      + '</div>'
      + '<div style="overflow:auto;flex:1;min-height:0;border:1px solid var(--border,#e3e8ef);border-radius:8px;background:#fff;">'
      +  '<table style="width:100%;border-collapse:collapse;font-size:0.78rem;table-layout:fixed;">'
      +   colgroup + thead + '<tbody>'+body+'</tbody></table>'
      + '</div>';
    view.querySelectorAll('.recap-row').forEach(function(tr){
      tr.addEventListener('click', function(){ var ref=tr.getAttribute('data-ref'); if (ref&&ref!=='—'){ if (typeof window.openDossierDrawer==='function') window.openDossierDrawer(ref); else _openByRef(ref); } });
      tr.addEventListener('mouseover', function(){ tr.style.background='#f0f5fb'; });
      tr.addEventListener('mouseout',  function(){ tr.style.background=''; });
    });
  }
  function _jq(v){ return "'"+String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'"; }
  window._recapColToggle=function(id){ var cfg=_recapColsCfg(); var h=cfg.hidden.slice(); var i=h.indexOf(id); if(i>=0) h.splice(i,1); else h.push(id); cfg.hidden=h; _recapColsSave(cfg); window.__recapMenuOpen=true; try{_render();}catch(e){} };
  window._recapColMove=function(id,dir){ var cfg=_recapColsCfg(); var o=cfg.order.slice(); var i=o.indexOf(id); if(i<0) return; var j=i+dir; if(j<0||j>=o.length) return; var t=o[i]; o[i]=o[j]; o[j]=t; cfg.order=o; _recapColsSave(cfg); window.__recapMenuOpen=true; try{_render();}catch(e){} };
  window._recapColsReset=function(){ try{ localStorage.removeItem(RECAP_COLS_KEY); }catch(e){} window.__recapMenuOpen=true; try{_render();}catch(e){} };
  window._recapRender = _render;
  window.recapRefresh = function(){ try { _render(); } catch(e){} };

  /* ⋮ menu open/close (porte de docs/monolito.html ~77834–77836 — no monólito
     esses handlers viviam junto do import CSV, num <script> separado; aqui
     ficam dentro do IIFE do Recap, já que o import CSV foi descartado mas o
     menu de colunas precisa deles). */
  window._recapMenuToggle = function(ev){ if(ev)ev.stopPropagation(); var mn=document.getElementById('recap-menu'); if(!mn)return; var open=(mn.style.display==='none'||!mn.style.display); mn.style.display=open?'block':'none'; window.__recapMenuOpen=open; };
  window._recapMenuClose = function(){ var mn=document.getElementById('recap-menu'); if(mn) mn.style.display='none'; window.__recapMenuOpen=false; };
  document.addEventListener('click', function(e){ var w=e.target.closest&&e.target.closest('.recap-menu-wrap'); if(!w) window._recapMenuClose(); });

  function _openByRef(ref){
    try {
      var list=JSON.parse(localStorage.getItem('expatur_dossier_list')||'[]'), id=null;
      for (var i=0;i<list.length;i++){ var dd=null; try{ dd=JSON.parse(localStorage.getItem('expatur_dossier_'+list[i].id)||'null'); }catch(e){} var r=(dd&&dd.fields&&dd.fields['booking-ref'])||list[i].label||''; if (r===ref){ id=list[i].id; break; } }
      if (id&&typeof window.switchDossier==='function') window.switchDossier(id);
      if (typeof window.sidebarGo==='function') window.sidebarGo('index');
    } catch(e){}
  }

  function _applyOn(){ var s=document.getElementById('section-bookings'); if(!s) return; var t=s.querySelector('.section-page-title');
    if (window.__RECAP_ENABLED){ s.classList.add('recap-on'); if(t) t.textContent='Recapitulative'; try{ _render(); }catch(e){} }
    else { s.classList.remove('recap-on'); if(t) t.textContent='Bookings'; try{ if(typeof window.bookingsRender==='function') window.bookingsRender(); }catch(e){} }
  }

  function _inject(){
    var sec=document.getElementById('section-bookings'); if(!sec) return;
    if (!document.getElementById('recap-view')){
      var st=document.createElement('style');
      st.textContent='#recap-view{display:none;flex-direction:column;flex:1;min-height:0;padding:0 clamp(1rem,3vw,2rem) 1.2rem;}'
        +'#section-bookings.recap-on .bk-toolbar,#section-bookings.recap-on #bk-main-view,#section-bookings.recap-on #bookings-detail{display:none !important;}'
        +'#section-bookings.recap-on #recap-view{display:flex;}';
      document.head.appendChild(st);
      var v=document.createElement('div'); v.id='recap-view'; sec.appendChild(v);
    }
    if (!window._recapSidebarWrapped && typeof window.sidebarGo==='function'){
      window._recapSidebarWrapped=true;
      var prev=window.sidebarGo;
      window.sidebarGo=function(section){ var r=prev.apply(this,arguments); if (section==='bookings'){ try{ _applyOn(); }catch(e){} } return r; };
    }
  }
  window.recapEnable  = function(){ window.__RECAP_ENABLED=true;  _applyOn(); };
  window.recapDisable = function(){ window.__RECAP_ENABLED=false; _applyOn(); };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', _inject); else setTimeout(_inject, 0);
})();

// ═══════════════════════════════════════════════════════════════════════════
// Recap — Bulk Edit / Bulk Delete (seleção múltipla). Port fiel de
// docs/monolito.html §16 (linhas ~78930–79125): um segundo IIFE top-level
// (hookado por window._recapBulkHooked, como no monólito, onde vivia num
// <script> próprio), que injeta a coluna de checkboxes no relatório — via
// _enhance(), reexecutado após cada recapRefresh/_recapRender — e o botão
// "Delete Selected".
//
// DROP integral do delete no Worker Cloudflare/D1: a função que fazia o DELETE
// remoto do booking, e a que buscava por GET o mapa de ids remotos (usada só
// para decidir se um ref também existia do lado do banco na nuvem), foram
// removidas por completo, assim como os helpers de URL/token que só serviam a
// elas — nenhuma chamada de rede sobrou neste arquivo.
// _doDelete agora só chama _deleteLocal(ref) (localStorage:
// expatur_dossier_list + expatur_dossier_<id> + expatur_deals_meta) e conta
// o sucesso direto, sem a ramificação por ids[ref] nem a cadeia de promises
// que essa ramificação exigia.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  if (window._recapBulkHooked) return; window._recapBulkHooked = true;

  var _bulkOn = false;
  var _sel = {};   /* ref -> true */

  window._recapBulkToggle = function(){ _bulkOn = !_bulkOn; if(!_bulkOn) _sel = {}; window.__recapBulkOn = _bulkOn; if(window._recapMenuClose) window._recapMenuClose(); _enhance(); };

  function _j(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function _selCount() { return Object.keys(_sel).filter(function (r) { return _sel[r]; }).length; }

  /* ── deletion helpers ──────────────────────────────────────────────────── */
  function _deleteLocal(ref) {
    var list = _j('expatur_dossier_list', []); if (!Array.isArray(list)) return false;
    var hit = null;
    for (var i = 0; i < list.length; i++) {
      var d = list[i]; if (!d || !d.id) continue;
      var dd = _j('expatur_dossier_' + d.id, null);
      var r = (dd && dd.fields && dd.fields['booking-ref']) || d.label || '';
      if (String(r) === String(ref) || String(d.id) === String(ref)) { hit = d; break; }
    }
    if (!hit) return false;
    _set('expatur_dossier_list', list.filter(function (d) { return d.id !== hit.id; }));
    try { localStorage.removeItem('expatur_dossier_' + hit.id); } catch (e) {}
    var tomb = _j('expatur_deals_tombstones', {}) || {}; tomb[hit.id] = { ref: String(ref), updated_at: new Date().toISOString() }; _set('expatur_deals_tombstones', tomb);
    var meta = _j('expatur_deals_meta', {}) || {}; delete meta[hit.id]; _set('expatur_deals_meta', meta);
    try { if (localStorage.getItem('expatur_active_dossier') === hit.id) localStorage.removeItem('expatur_active_dossier'); } catch (e) {}
    return true;
  }

  function _doDelete() {
    var refs = Object.keys(_sel).filter(function (r) { return _sel[r]; });
    if (!refs.length) return;
    if (!window.confirm('Delete ' + refs.length + ' selected booking(s)? This action cannot be undone.')) return;
    var n = 0;
    refs.forEach(function (ref) {
      var did = _deleteLocal(ref);
      if (did) n++;
    });
    _sel = {}; _bulkOn = false;
    try { if (window._dealsSyncNow) window._dealsSyncNow(); } catch (e) {}
    /* recap re-render (recomputes all totals) */
    try { if (window.recapRefresh) window.recapRefresh(); } catch (e) {}
    setTimeout(function () { _enhance(); }, 60);
    if (window.toast) toast(n + ' bookings deleted successfully.', 'success');
  }

  /* ── DOM enhancement (runs after every recap render) ───────────────────── */
  function _enhance() {
    var view = document.getElementById('recap-view'); if (!view) return;
    var table = view.querySelector('table'); if (!table) return;

    /* Delete-Selected button — Bulk Edit toggle now lives in the ⋮ Actions menu */
    var bar = view.querySelector('.recap-menu-wrap');
    if (bar && bar.parentNode && !bar.parentNode.querySelector('#recap-bulk-del')) {
      var wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-flex;gap:8px;align-items:center;margin-right:8px;';
      wrap.innerHTML =
        '<button id="recap-bulk-del" type="button" style="display:none;background:#b91c1c;color:#fff;border:none;border-radius:6px;font-size:0.7rem;font-weight:700;padding:6px 13px;cursor:pointer;font-family:inherit;">Delete Selected</button>';
      bar.parentNode.insertBefore(wrap, bar);
      wrap.querySelector('#recap-bulk-del').onclick = function () { _doDelete(); };
    }
    window.__recapBulkOn = _bulkOn;
    var _bmi = document.getElementById('recap-bulk-mi');
    if (_bmi) _bmi.innerHTML = _bulkOn ? '✓ Quitter la sélection' : '✎ Sélection multiple (Bulk Edit)';
    var del = document.getElementById('recap-bulk-del');
    if (del) {
      del.style.display = _bulkOn ? 'inline-block' : 'none';
      var c = _selCount();
      del.textContent = 'Delete Selected (' + c + ')';
      del.disabled = (c === 0);
      del.style.opacity = c === 0 ? '0.5' : '1';
      del.style.cursor = c === 0 ? 'not-allowed' : 'pointer';
    }

    /* checkbox column — add only in bulk mode, and only once per render */
    var hasCb = !!table.querySelector('th.recap-bulk-cb');
    if (_bulkOn && !hasCb) {
      var cg = table.querySelector('colgroup');
      if (cg) { var col = document.createElement('col'); col.style.width = '42px'; col.className = 'recap-bulk-col'; cg.insertBefore(col, cg.firstChild); }
      var htr = table.querySelector('thead tr');
      if (htr) {
        var th = document.createElement('th');
        th.className = 'recap-bulk-cb';
        th.style.cssText = 'padding:11px 10px;text-align:center;';
        th.innerHTML = '<input type="checkbox" id="recap-cb-all" title="Tout sélectionner" style="width:15px;height:15px;cursor:pointer;">';
        htr.insertBefore(th, htr.firstChild);
        th.querySelector('#recap-cb-all').onclick = function (e) {
          e.stopPropagation();
          var on = this.checked;
          table.querySelectorAll('tbody tr.recap-row').forEach(function (tr) {
            var ref = tr.getAttribute('data-ref'); if (!ref) return;
            _sel[ref] = on; var cb = tr.querySelector('.recap-row-cb'); if (cb) cb.checked = on;
          });
          _enhance();
        };
      }
      table.querySelectorAll('tbody tr.recap-row').forEach(function (tr) {
        var ref = tr.getAttribute('data-ref');
        var td = document.createElement('td');
        td.className = 'recap-bulk-cb';
        td.style.cssText = 'text-align:center;border-top:1px solid #eef1f5;';
        td.innerHTML = '<input type="checkbox" class="recap-row-cb" ' + (_sel[ref] ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;">';
        tr.insertBefore(td, tr.firstChild);
        var cb = td.querySelector('.recap-row-cb');
        cb.onclick = function (e) { e.stopPropagation(); _sel[ref] = this.checked; _enhance(); };
      });
      /* fix empty-state colspan if present */
      var empty = table.querySelector('tbody tr td[colspan]');
      if (empty) empty.setAttribute('colspan', String((parseInt(empty.getAttribute('colspan'), 10) || 1) + 1));
    }

    /* select-all reflects current state */
    var all = document.getElementById('recap-cb-all');
    if (all) { var rows = table.querySelectorAll('tbody tr.recap-row'); var sc = _selCount(); all.checked = rows.length > 0 && sc >= rows.length; }
  }

  /* in bulk mode, intercept row clicks (capture phase) so they toggle instead
     of opening the dossier */
  document.addEventListener('click', function (e) {
    if (!_bulkOn) return;
    var view = document.getElementById('recap-view'); if (!view || !view.contains(e.target)) return;
    if (e.target.closest && (e.target.closest('#recap-bulk-btn') || e.target.closest('#recap-bulk-del') || e.target.closest('.recap-menu-wrap'))) return;
    var row = e.target.closest && e.target.closest('tr.recap-row');
    if (row) {
      if (e.target.classList && e.target.classList.contains('recap-row-cb')) return; /* checkbox handles itself */
      e.preventDefault(); e.stopPropagation();
      var ref = row.getAttribute('data-ref'); if (!ref) return;
      _sel[ref] = !_sel[ref];
      var cb = row.querySelector('.recap-row-cb'); if (cb) cb.checked = _sel[ref];
      _enhance();
    }
  }, true);

  /* re-enhance after any recap render (wrap public fns + observe the view) */
  ['recapRefresh', '_recapRender'].forEach(function (name) {
    var orig = window[name];
    if (typeof orig === 'function' && !orig._bulkWrapped) {
      var w = function () { var r = orig.apply(this, arguments); setTimeout(_enhance, 0); return r; };
      w._bulkWrapped = true; window[name] = w;
    }
  });
  function _observe() {
    var view = document.getElementById('recap-view'); if (!view) { setTimeout(_observe, 600); return; }
    try {
      var mo = new MutationObserver(function () { if (_enhanceLock) return; _enhanceLock = true; setTimeout(function () { _enhanceLock = false; _enhance(); }, 30); });
      mo.observe(view, { childList: true, subtree: true });
    } catch (e) {}
    _enhance();
  }
  var _enhanceLock = false;
  setTimeout(_observe, 1200);
})();
