// ═══════════════════════════════════════════════════════════════════════════
// DXR — Dossier Command-Center Drawer. Port fiel de docs/monolito.html,
// IIFE do drawer (linhas 76482–77714). Painel lateral deslizante (#dxr-panel
// dentro de #dxr-overlay) aberto via window.openDossierDrawer(ref), mostrando
// travel + ledger financeiro editável + tarefas + histórico + memo + NF +
// passaporte + links (email/facture/client/fornecedor). Injeta seu próprio
// CSS dxr-* (array de strings de estilo). 100% localStorage — sem
// Cloudflare/rede: lê apenas os stores já existentes (dossiê, billet, ledger
// financeiro, pagamentos, tarefas).
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  if (window._dxrInit) return; window._dxrInit = true;

  function _esc(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _iata(fn){ var s=String(fn||'').toUpperCase(); var m=s.match(/^([A-Z]{1,3})\s*\d/); if(m) return m[1]; var m2=s.match(/\b([A-Z]{2})\b/); return m2?m2[1]:''; }
  function _num(v){ if (typeof v==='number') return isNaN(v)?0:v; var n=parseFloat(String(v==null?'':v).replace(/[^\d.,-]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.')); return isNaN(n)?0:n; }
  var MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function _dt(v){ if(!v) return null; var d=(v instanceof Date)?v:new Date(v); return isNaN(d.getTime())?null:d; }
  function _fmtD(v){ var d=_dt(v); if(!d) return '—'; return ('0'+d.getDate()).slice(-2)+' '+MON[d.getMonth()]+' '+d.getFullYear(); }
  function _fmtDDMMMYY(v){ var d=_dt(v); if(!d) return '—'; return ('0'+d.getDate()).slice(-2)+MON[d.getMonth()]+String(d.getFullYear()).slice(-2); }
  function _brl(n){ return 'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function _san(ref){ return String(ref).replace(/[^a-zA-Z0-9]/g,'_'); }
  function _ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function _json(k,def){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?def:v; }catch(e){ return def; } }

  function _resolve(ref){
    var list=_json('expatur_dossier_list',[])||[];
    for (var i=0;i<list.length;i++){
      var dd=_json('expatur_dossier_'+list[i].id,null);
      var r=(dd&&dd.fields&&dd.fields['booking-ref'])||list[i].label||'';
      if (r===ref) return { id:list[i].id, data:dd };
    }
    return { id:null, data:null };
  }
  function _billet(ref){ return _json('expatur_billet_'+_san(ref), null); }
  function _finLines(ref){ var a=_json('expatur_financeiro_lancamentos',[])||[]; if(!Array.isArray(a)) a=[]; return a.filter(function(x){ return x && String(x.dossierRef||'')===String(ref) && x.source_type!=='pnl_total_cost' && !/^pnl_total_cost__/.test(String(x.source_id||'')); }); }
  function _lineAmt(l){ return _num(l.brl_amount!=null?l.brl_amount:(l.amount_brl!=null?l.amount_brl:l.valor)); }
  function _payments(ref){ var p=_json('expatur_payments_'+_san(ref), null); return p; }
  function _tasks(ref){ var t=_json('tasks_v2_'+ref, []); return Array.isArray(t)?t:[]; }
  function _meUser(){ try{ return window.__loginEmail || localStorage.getItem('expatur_login_email') || ''; }catch(e){ return ''; } }
  function _taskStatus(t){ if(t.done||t.status==='done'||t.status==='completed') return 'completed'; var st=String(t.status||'').toLowerCase(); if(st.indexOf('wait')>=0||st.indexOf('attente')>=0) return 'waiting'; if(st.indexOf('progress')>=0||st.indexOf('cours')>=0||st==='doing') return 'inprogress'; return 'open'; }

  /* itinerary legs: prefer billet, else dossier fields/multiLegs */
  function _legs(data, bil){
    if (bil && bil.legs && bil.legs.length){
      return bil.legs.map(function(l){ return {
        dep:(l.dep||'').toUpperCase(), arr:(l.arr||'').toUpperCase(),
        date:l.depDate||l.date||'', fn:l.fn||l.label||'', airline:l.airline||_iata(l.fn),
        depTime:l.depTime||((l.segments&&l.segments[0]&&l.segments[0].depTime)||''),
        arrTime:l.arrTime||((l.segments&&l.segments.length&&l.segments[l.segments.length-1].arrTime)||''),
        pnr:l.pnr||'', bags:l.bags||'', segments:(l.segments&&l.segments.length>1?l.segments:null) }; });
    }
    var f=(data&&data.fields)||{}, tt=(data&&data.tripType)||'oneway', legs=[];
    var d1=(f['dep1']||'').toUpperCase(), a1=(f['arr1']||'').toUpperCase();
    if (tt==='multicity'){ if(d1||a1) legs.push({dep:d1,arr:a1,date:f['date-leg1']||''}); (data.multiLegs||[]).forEach(function(l){ if(l.dep||l.arr) legs.push({dep:(l.dep||'').toUpperCase(),arr:(l.arr||'').toUpperCase(),date:l.date||''}); }); }
    else if (tt==='return'){ if(d1||a1){ legs.push({dep:d1,arr:a1,date:f['date-leg1']||''}); legs.push({dep:(f['dep2']||a1).toUpperCase(),arr:(f['arr2']||d1).toUpperCase(),date:f['date-leg2']||''}); } }
    else { if(d1||a1) legs.push({dep:d1,arr:a1,date:f['date-leg1']||''}); }
    return legs;
  }
  function _typeLabel(data, legs){
    var tt=(data&&data.tripType)||'oneway';
    if (tt==='multicity') return 'Multi-City';
    if (tt==='return'){ if(legs.length>=2){ var a=legs[0],b=legs[1]; if(!(a.arr&&b.dep&&a.dep&&b.arr&&a.arr===b.dep&&b.arr===a.dep)) return 'Open Jaw'; } return 'Round Trip'; }
    return 'One Way';
  }
  function _pnrs(bil){
    var out=[], seen={};
    function add(air,pnr,segs){ if(!pnr) return; pnr=String(pnr).trim().toUpperCase(); if(!pnr) return; var k=(air||'')+'|'+pnr; if(seen[k]){ seen[k].seg++; return; } var o={airline:air||'',pnr:pnr,seg:segs||1}; seen[k]=o; out.push(o); }
    if (bil){
      if (bil.isMC){ (bil.legs||[]).forEach(function(l){ if(l.pnr) add(_iata(l.airline||l.fn), l.pnr, (l.segments&&l.segments.length)||1); }); }
      else if (bil.masterPnr){ var segs=0; (bil.legs||[]).forEach(function(l){ segs+=(l.segments&&l.segments.length)||1; }); var l0=(bil.legs&&bil.legs[0])||{}; add(_iata(l0.airline||l0.fn), bil.masterPnr, segs||((bil.legs||[]).length||1)); }
      if (!out.length && bil.pax){ bil.pax.forEach(function(p){ if(p.pnr) add('',p.pnr,1); }); }
    }
    return out;
  }

  /* ── one place that gathers everything ── */
  function _gather(ref){
    var r=_resolve(ref), data=r.data||{fields:{},paxRows:[],multiLegs:[]}, id=r.id;
    var f=data.fields||{}, bil=_billet(ref), fin=_finLines(ref);
    var legs=_legs(data,bil), type=_typeLabel(data,legs), pnrs=_pnrs(bil);
    var issued=_ls('billetFrozen_'+ref)==='1';
    var booked=(id&&_ls('expatur_booked_'+id)==='1')||!!_ls('expatur_bookedAt_'+ref);
    var bookedAt=_ls('expatur_bookedAt_'+ref)||(bil&&bil.savedAt)||'';
    var issueAt=(issued&&bil&&bil.savedAt)||'';
    /* suppliers */
    var supMap={};
    fin.forEach(function(l){ var nm=l.fornecedor||'—'; var s=supMap[nm]||(supMap[nm]={name:nm,total:0,miles:0,pnrs:{},status:l.pago?'pago':'pendente',n:0}); s.total+=_lineAmt(l); s.miles+=_num(l.miles); if(l.pnr) s.pnrs[String(l.pnr).toUpperCase()]=1; s.n++; if(!l.pago) s.status='pendente'; });
    var suppliers=Object.keys(supMap).map(function(k){ var s=supMap[k]; s.pnrCount=Object.keys(s.pnrs).length; return s; });
    /* ffp */
    var ffpMap={};
    fin.forEach(function(l){ var pr=l.programme||l.programa; if(!pr) return; var g=ffpMap[pr]||(ffpMap[pr]={name:pr,miles:0,cost:0,n:0}); g.miles+=_num(l.miles); g.cost+=_lineAmt(l); g.n++; });
    var ffp=Object.keys(ffpMap).map(function(k){ var g=ffpMap[k]; g.cpm=g.miles>0?(g.cost/g.miles*1000):0; return g; }).sort(function(a,b){ return b.miles-a.miles; });
    var milesTotal=ffp.reduce(function(s,g){ return s+g.miles; },0) || fin.reduce(function(s,l){ return s+_num(l.miles); },0);
    var repasse=fin.reduce(function(s,l){ return s+_lineAmt(l); },0);
    var taxes=fin.reduce(function(s,l){ return s+_num(l.taxas); },0);
    /* passengers (billet pax preferred) */
    var pax=[];
    var _pr=(data.paxRows&&data.paxRows.length)?data.paxRows:[];
    if (bil&&bil.pax&&bil.pax.length){ pax=bil.pax.map(function(p,ix){ return { name:((p.prenom||'')+' '+(p.nom||'')).trim()||'—', tickets:(p.etkts||[]).filter(Boolean), etktsRaw:(p.etkts||[]).slice(), pnr:p.pnr||'', dob:p.dob||(_pr[ix]&&_pr[ix].dob)||'', type:(p.badge||p.type||(_pr[ix]&&_pr[ix].type)||'') }; }); }
    else if (_pr.length){ pax=_pr.filter(function(p){ return (p.name||'').trim(); }).map(function(p){ return {name:p.name,tickets:[],pnr:'',dob:p.dob||'',type:p.type||''}; }); }
    if (!pax.length && (f['pax-name-1']||'').trim()) pax=[{name:f['pax-name-1'].trim(),tickets:[],pnr:'',dob:'',type:''}];
    /* finance numbers */
    var cur=f['currency']||'€';
    var sell=(_num(f['pax-adultes'])*_num(f['price-adulte']))+(_num(f['pax-enfants'])*_num(f['price-enfant']))+(_num(f['pax-bebes'])*_num(f['price-bebe']));
    if (_num(f['discount-value'])>0) sell=Math.max(0,sell-_num(f['discount-value']));
    var serviceFees=(data.customLines||[]).reduce(function(s,c){ return s+_num(c.qty||1)*_num(c.price); },0);
    var commission=_num(f['vendeur-commission']); var commCur=(f['vendeur-commission-type']||'eur');
    var _savedDeal=null; try{ _savedDeal=(window.__recapDealByRef&&window.__recapDealByRef[ref])||null; if(_savedDeal==='\u2014') _savedDeal=null; }catch(e){}
    var dealStr=(typeof window._diDealValue==='function'&&window._diDealValue(data))||_savedDeal||((sell?sell.toLocaleString('fr-FR'):'—')+' '+cur);
    /* P&L snapshot (expatur_pnl_<ref>) is the source of truth for issued margin in BRL.
       Prefer it (works for $/€ deals); fall back to a local R$ computation. */
    var pnl=_json('expatur_pnl_'+ref, null);
    var marginBRL=null, marginPct=null, netResult=null;
    if (pnl && pnl.ravBrut!=null){
      marginBRL=_num(pnl.ravBrut);
      netResult=(pnl.netRAV!=null)?_num(pnl.netRAV):marginBRL;
      marginPct=(pnl.netMarg!=null)?_num(pnl.netMarg):((pnl.grossMarg!=null)?_num(pnl.grossMarg):null);
    } else if (cur==='R$'){
      var commBRL=(commCur==='brl'||commCur==='R$')?commission:0;
      marginBRL=sell+serviceFees-repasse-taxes-commBRL; netResult=marginBRL;
      marginPct=(sell+serviceFees)>0?(marginBRL/(sell+serviceFees)*100):null;
    }
    /* ── FFP yield analysis — deal value attributed per program by cost share ── */
    var _revBRL=(pnl&&pnl.netSell!=null)?_num(pnl.netSell):((pnl&&pnl.grossSell!=null)?_num(pnl.grossSell):(cur==='R$'?sell:0));
    var _totFfpCost=ffp.reduce(function(s,x){return s+x.cost;},0);
    var _totFfpMiles=ffp.reduce(function(s,x){return s+x.miles;},0);
    ffp.forEach(function(x){
      x.share=_totFfpCost>0?x.cost/_totFfpCost:(ffp.length?1/ffp.length:0);
      x.revenue=_revBRL*x.share;          /* deal value attributed to this FFP */
      x.sppm=x.miles>0?x.revenue/x.miles:0;   /* selling price per mile (BRL) */
      x.cpmMile=(x.cpm||0)/1000;          /* cost per mile (cpm is per 1000) */
      x.marginMile=x.sppm-x.cpmMile;      /* yield per mile */
    });
    var ffpExec=null;
    if (ffp.length){
      var _totRev=ffp.reduce(function(s,x){return s+x.revenue;},0);
      var _byY=ffp.slice().sort(function(a,b){return b.marginMile-a.marginMile;});
      ffpExec={ totalMiles:_totFfpMiles, wAvgSPP:_totFfpMiles>0?_totRev/_totFfpMiles:0, highest:_byY[0], lowest:_byY[_byY.length-1], count:ffp.length };
    }
    /* ── tasks (first-class) ── */
    var tasks=_tasks(ref);
    var taskCounts={total:tasks.length,open:0,waiting:0,inprogress:0,completed:0};
    tasks.forEach(function(t){ taskCounts[_taskStatus(t)]++; });
    /* payments / paid */
    var pay=_payments(ref); var paid=false, payEvents=[];
    if (pay){ if (Array.isArray(pay)){ paid=pay.some(function(p){ return p&&(p.paid||p.status==='paid'||p.received); }); pay.forEach(function(p){ if(p&&(p.date||p.createdAt)) payEvents.push({when:p.date||p.createdAt,label:'Paiement enregistré'}); }); }
      else if (typeof pay==='object'){ paid=!!(pay.paid||pay.status==='paid'); if(pay.date||pay.createdAt) payEvents.push({when:pay.date||pay.createdAt,label:'Paiement enregistré'}); } }
    if (!paid && fin.length) paid=fin.every(function(l){ return l.pago; });
    /* payment status (CloudFare invoice system): paid / partial / unpaid */
    var payState=paid?'paid':'unpaid';
    if (!paid){ var _anyPay=false;
      if (Array.isArray(pay)) _anyPay=pay.some(function(p){ return p&&(p.paid||p.status==='paid'||p.received||_num(p.amount)>0||_num(p.paidAmount)>0); });
      else if (pay&&typeof pay==='object') _anyPay=!!(pay.paid||pay.received||_num(pay.paidAmount)>0);
      if (!_anyPay && fin.length) _anyPay=fin.some(function(l){ return l.pago; });
      if (_anyPay) payState='partial';
    }
    /* Nota Fiscal — read from existing sources (finance line nota / em_invoice) */
    var nf=null, emInv=_json('expatur_em_invoice_'+_san(ref),null);
    var nfLine=fin.find(function(l){ return (l.categoria==='Notas Fiscais'||l.categoria==='Facture') && (l.nf||l.numero); });
    if (emInv && (emInv.number||emInv.id)) nf={number:emInv.number||emInv.id, date:emInv.date||emInv.createdAt||'', amount:emInv.amount||emInv.total||'', status:emInv.status||'emitida'};
    else if (nfLine) nf={number:nfLine.nf||nfLine.numero, date:nfLine.vencimento||'', amount:_lineAmt(nfLine), status:nfLine.pago?'paga':'emitida'};
    var _tks=_tasks(ref), _nfTask=null;
    for (var _ti=_tks.length-1;_ti>=0;_ti--){ var _t=_tks[_ti]; if(_t && (_t.cat==='Notas Fiscais'||_t.category==='Notas Fiscais')){ _nfTask=_t; if(_t.nfNumber) break; } }
    if (_nfTask && _nfTask.nfNumber){ if(!nf) nf={number:_nfTask.nfNumber, date:_nfTask.doneAt||'', amount:'', status:_nfTask.done?'emitida':'à émettre'}; else if(!nf.number) nf.number=_nfTask.nfNumber; }
    /* NF number must come only from a real NF/invoice source — never leak the
       'Synced from Cost Calculator row N' ledger memo into the Numéro field. */
    if (nf && nf.number && /cost calculator|synced from/i.test(String(nf.number))) nf.number='';
    /* operational memo (stored inside the dossier record — single source) */
    var memo=(data.memo&&typeof data.memo==='object')?data.memo:null;
    /* owner */
    var owner=f['vendeur-select']||'—';
    /* activity timeline */
    var acts=[];
    if (bookedAt) acts.push({when:bookedAt,label:'Booking créé'});
    if (issueAt) acts.push({when:issueAt,label:'Billet émis'});
    if (suppliers.length) acts.push({when:issueAt||bookedAt,label:'Fournisseur(s) assigné(s)'});
    if (milesTotal>0) acts.push({when:issueAt||bookedAt,label:'Miles alloués ('+milesTotal.toLocaleString('pt-BR')+')'});
    if (nf) acts.push({when:nf.date,label:'Nota Fiscal générée'+(nf.number?(' #'+nf.number):'')});
    payEvents.forEach(function(e){ acts.push(e); });
    tasks.forEach(function(t){ var cd=t.createdAt||t.created||''; if(cd) acts.push({when:cd,label:'Tâche créée : '+(t.title||t.text||'—')}); if(t.done){ var dd=t.doneAt||t.updatedAt||''; if(dd) acts.push({when:dd,label:'Tâche terminée : '+(t.title||t.text||'—')}); } });
    acts=acts.filter(function(a){ return _dt(a.when); }).sort(function(a,b){ return _dt(a.when)-_dt(b.when); });

    /* RAV from the financial-engine snapshot (issued P&L) — single source. */
    var rav={ brut:(pnl&&pnl.ravBrut!=null)?_num(pnl.ravBrut):((cur==='R$'&&marginBRL!=null)?marginBRL:null),
              brutPct:(pnl&&pnl.grossMarg!=null)?_num(pnl.grossMarg):marginPct,
              trib:(pnl&&pnl.netRAV!=null)?_num(pnl.netRAV):null,
              tribPct:(pnl&&pnl.netMarg!=null)?_num(pnl.netMarg):null };
    var masterPnr=(bil&&bil.masterPnr)||(pnrs[0]&&pnrs[0].pnr)||((legs[0]&&legs[0].pnr)||'');
    return { ref:ref, id:id, data:data, f:f, bil:bil, legs:legs, type:type, pnrs:pnrs,
      issued:issued, booked:booked, paid:paid, payState:payState, nf:nf, bookedAt:bookedAt, issueAt:issueAt, owner:owner,
      suppliers:suppliers, ffp:ffp, fin:fin, milesTotal:milesTotal, repasse:repasse, taxes:taxes, pax:pax,
      cur:cur, sell:sell, serviceFees:serviceFees, commission:commission, commCur:commCur, dealStr:dealStr,
      marginBRL:marginBRL, marginPct:marginPct, netResult:netResult, rav:rav, masterPnr:masterPnr, pnl:pnl, ffpExec:ffpExec, tasks:tasks, taskCounts:taskCounts, memo:memo, acts:acts };
  }

  /* ───────────────── RENDER ───────────────── */
  function _badge(on,txt,color){ return '<span class="dxr-badge" style="background:'+(on?color:'#e9edf2')+';color:'+(on?'#fff':'#9aa7b4')+';">'+txt+'</span>'; }
  /* Status chips — derived strictly from the CloudFare invoice system. */
  function _nfChip(g){ var n=(g.nf&&g.nf.number)?String(g.nf.number).trim():''; return n?'<span class="dxr-chip" style="background:#16a34a;color:#fff;" title="Nota Fiscal '+_esc(n)+'">NF \u2713</span>':'<span class="dxr-chip" style="background:#eef2f7;color:#9aa7b4;" title="Aucune Nota Fiscal \u00e9mise">NF \u2014</span>'; }
  function _payChip(g){ var s=g.payState||(g.paid?'paid':'unpaid'); if(s==='paid') return '<span class="dxr-chip" style="background:#16a34a;color:#fff;" title="Facture r\u00e9gl\u00e9e (CloudFare)">PAID</span>'; if(s==='partial') return '<span class="dxr-chip" style="background:#f59e0b;color:#fff;" title="Facture partiellement r\u00e9gl\u00e9e (CloudFare)">PARTIAL</span>'; return '<span class="dxr-chip" style="background:#f59e0b;color:#fff;" title="Facture non r\u00e9gl\u00e9e (CloudFare)">UNPAID</span>'; }
  /* ── RAV mirror formatters (identical strings for Cost Financier + NF box) ── */
  function _pct(v){ return (v==null)?null:(_num(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'); }
  function _ravBrutStr(g){ var r=(g&&g.rav)||{}; if(r.brut==null) return '\u2014'; var s=_brl(r.brut), p=_pct(r.brutPct); return p?(s+' \u00b7 '+p):s; }
  function _ravTribStr(g){ var r=(g&&g.rav)||{}; if(r.trib==null && r.tribPct==null) return '\u2014'; var s=(r.trib!=null)?_brl(r.trib):'', p=_pct(r.tribPct); return (s&&p)?(s+' \u00b7 '+p):(s||p||'\u2014'); }

  /* ── Supplier ↔ Cost-Financier mirror (single source: finance ledger) ──
     The dossier Cost-Financier table and the Suppliers popup are both views
     over expatur_financeiro_lancamentos. This reconcile keeps them mirrored:
     every REAL supplier cost line gets a PNR (reuse existing, else master) and
     a fornecedor_id, and a supplier entity is auto-created if missing. Lines are
     never deleted; suppliers are name-keyed so they stay unique (no duplicate
     supplier rows). Placeholder selections are skipped. CloudFare entity map. */
  function _isPlaceholderSup(n){ n=String(n||'').trim().toLowerCase(); return !n||n==='\u2014'||n==='-'||/s[\u00e9e]lection|selecion/.test(n); }
  function _dxrSyncSuppliers(ref){
    var bil=_billet(ref); var master=(bil&&bil.masterPnr)||'';
    var all; try{ all=JSON.parse(localStorage.getItem('expatur_financeiro_lancamentos')||'[]'); }catch(e){ all=[]; }
    if(!Array.isArray(all)) all=[];
    var forns; try{ forns=JSON.parse(localStorage.getItem('expatur_fornecedores')||'[]'); }catch(e){ forns=[]; }
    if(!Array.isArray(forns)) forns=[];
    function _norm(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
    var nameToId={}; forns.forEach(function(f){ if(f&&f.nome) nameToId[_norm(f.nome)]=f.id||null; });
    var changedFin=false, changedForn=false;
    all.forEach(function(l){
      if(!l || String(l.dossierRef||'')!==String(ref)) return;
      if(_isPlaceholderSup(l.fornecedor)) return;              /* skip placeholder supplier */
      if(!l.linked_pnr && master){ l.linked_pnr=master; changedFin=true; }   /* reuse PNR / master */
      var key=_norm(l.fornecedor);
      if(!(key in nameToId)){
        var id='forn_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
        forns.push({ id:id, nome:String(l.fornecedor).trim(), createdAt:new Date().toISOString(), source:'cost_financier_sync' });
        nameToId[key]=id; changedForn=true;
      }
      if(!l.fornecedor_id && nameToId[key]){ l.fornecedor_id=nameToId[key]; changedFin=true; }
    });
    /* de-dup supplier records by normalized name (no duplicate supplier rows) */
    var seen={}, deduped=[]; forns.forEach(function(f){ var k=_norm(f&&f.nome); if(!k){ return; } if(seen[k]){ changedForn=true; return; } seen[k]=1; deduped.push(f); });
    try{ if(changedFin) localStorage.setItem('expatur_financeiro_lancamentos', JSON.stringify(all)); }catch(e){}
    try{ if(changedForn) localStorage.setItem('expatur_fornecedores', JSON.stringify(deduped)); }catch(e){}
  }
  window._dxrSyncSuppliers=_dxrSyncSuppliers;

  /* ── Passenger label (global rule): singular for 1, plural for >1 ── */
  function _paxLabel(n){ n=Number(n)||0; return (n===1?'Passager':'Passagers')+' ('+n+')'; }

  /* ── Invoice link resolver (CloudFare invoice entity, tied to the deal) ──
     Resolves the deal's invoice URL dynamically — never hardcoded. */
  function _dxrInvoiceUrl(ref){
    var san=_san(ref);
    function _g(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
    var pc=_g('expatur_pay_ctrl_'+san); if(pc&&pc.customLink) return String(pc.customLink).trim();
    var pay=_payments(ref);
    if(Array.isArray(pay)){ for(var i=0;i<pay.length;i++){ var q=pay[i]; if(q&&(q.stripeUrl||q.hostedUrl||q.url||q.hosted_invoice_url)) return q.stripeUrl||q.hostedUrl||q.url||q.hosted_invoice_url; } }
    else if(pay&&typeof pay==='object'){ if(pay.stripeUrl||pay.hostedUrl||pay.url||pay.hosted_invoice_url) return pay.stripeUrl||pay.hostedUrl||pay.url||pay.hosted_invoice_url; }
    var em=_g('expatur_em_invoice_'+san); if(em&&(em.hosted_invoice_url||em.url||em.stripeUrl)) return em.hosted_invoice_url||em.url||em.stripeUrl;
    return '';
  }
  window._dxrInvoiceUrl=_dxrInvoiceUrl;
  window._dxrInvoice=function(){
    if(!_cur) return; var url=_dxrInvoiceUrl(_cur.ref);
    if(!url){ if(window.toast) toast('Aucune facture li\u00e9e \u00e0 ce dossier','error'); return; }
    try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url); }catch(e){}
    try{ window.open(url,'_blank','noopener'); }catch(e){}
    if(window.toast) toast('Lien facture copi\u00e9 + ouvert','success');
  };

  /* Passenger category code only (ADT / CHD / INF) — shown right of pax box */
  function _paxCat(t){ t=String(t||'').toLowerCase(); if(t.indexOf('inf')>=0||t.indexOf('beb')>=0) return 'INF'; if(t.indexOf('chd')>=0||t.indexOf('enf')>=0||t.indexOf('child')>=0) return 'CHD'; return 'ADT'; }

  /* Cells for one editable FINANCIAL BREAKDOWN row (used by render + add) */
  function _finCells(r){
    /* No per-field OK gate: the Total BRL recomputes live on input and edits
       persist silently on change; the explicit cross-record sync confirmation
       happens once via the header Save button. */
    var ev=' onfocus="this.setAttribute(\'data-orig\',this.value)" onchange="window._dxrFinRecalc(); try{_dxrFinPersist();}catch(e){}"';
    function inT(f,v,cls){ return '<td><input class="dxr-fe dxr-fe-txt'+(cls?' '+cls:'')+'" data-f="'+f+'" value="'+_esc(v)+'" oninput="window._dxrFinRecalc()"'+ev+'></td>'; }
    function inN(f,v){ return '<td><input class="dxr-fe dxr-fe-num" data-f="'+f+'" inputmode="decimal" value="'+_esc(v)+'" oninput="window._dxrFinRecalc()"'+ev+'></td>'; }
    function selF(f,cur,list,ph){ var o=(ph!=null?('<option value="'+_esc(ph)+'"'+((!cur||cur===ph)?' selected':'')+'>'+_esc(ph)+'</option>'):'')+_optsHtml(list,cur); return '<td><select class="dxr-fe dxr-fe-sel" data-f="'+f+'"'+ev+'>'+o+'</select></td>'; }
    return selF('trecho', r.trecho, _legRouteOpts(), '\u2014 Trecho \u2014')
      + selF('programme', r.prog, _ffpList(), '\u2014 Programme \u2014')
      + selF('fornecedor', r.forn, _supList(), '\u2014 S\u00e9lectionner \u2014')
      + inT('pnr', r.pnr, 'dxr-fe-pnr')
      + inN('miles', r.miles)
      + inN('cpm', r.cpm)
      + inN('taxas', r.tax)
      + inN('extra', r.extra)
      + '<td class="dxr-num-c dxr-snap-sub" data-sub>'+_brl(_num(r.sub))+'</td>'
      + '<td class="dxr-fe-del"><button title="Supprimer la ligne" onclick="window._dxrFinDelete(this)">\u2715</button></td>';
  }

  /* Live recompute (formula conserved) + persist; keeps input focus (no re-render) */
  window._dxrFinRecalc=function(){
    var card=document.getElementById('dxr-fin-card'); if(!card) return;
    var rows=card.querySelectorAll('tbody tr.dxr-fe-row');
    var tMiles=0,tTax=0,tExtra=0,tSub=0,tMilesCost=0;
    Array.prototype.forEach.call(rows,function(tr){
      function v(f){ var el=tr.querySelector('[data-f="'+f+'"]'); return el?_num(el.value):0; }
      var miles=v('miles'),cpm=v('cpm'),tax=v('taxas'),extra=v('extra');
      var milesCost=miles/1000*cpm, sub=milesCost+tax+extra;
      var sc=tr.querySelector('[data-sub]'); if(sc) sc.textContent=_brl(sub);
      tMiles+=miles; tTax+=tax; tExtra+=extra; tSub+=sub; tMilesCost+=milesCost;
    });
    function setT(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
    setT('dxr-tot-miles', tMiles?tMiles.toLocaleString('pt-BR'):'\u2014');
    setT('dxr-tot-tax', _brl(tTax));
    setT('dxr-tot-extra', tExtra?_brl(tExtra):'\u2014');
    setT('dxr-tot-sub', _brl(tSub));
    setT('dxr-cb-supplier', _brl(tSub));
    setT('dxr-cb-miles', _brl(tMilesCost));
    setT('dxr-cb-taxes', _brl(tTax));
    var rb=parseFloat(card.getAttribute('data-ravbrut')), nr=parseFloat(card.getAttribute('data-netrav')),
        tc=parseFloat(card.getAttribute('data-totalcost')), gm=parseFloat(card.getAttribute('data-grossmarg')),
        nm=parseFloat(card.getAttribute('data-netmarg'));
    function pctStr(x){ return x.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'; }
    if(!isNaN(rb)&&!isNaN(tc)){
      var delta=tSub-tc, ravB=rb-delta;
      var ravBp=(rb!==0&&!isNaN(gm))?(gm*(ravB/rb)):null;
      var ravN=!isNaN(nr)?(nr-delta):null, ravNp=(ravN!=null&&nr!==0&&!isNaN(nm))?(nm*(ravN/nr)):null;
      var brutStr=_brl(ravB)+(ravBp!=null?' \u00b7 '+pctStr(ravBp):'');
      setT('dxr-rav-brut-v', brutStr);
      if(ravN!=null) setT('dxr-rav-net-v', _brl(ravN)+(ravNp!=null?' \u00b7 '+pctStr(ravNp):''));
      setT('dxr-ravbrut-nf', _brl(ravB));   /* NF box Valeur N.F mirror (value only) */
    }
  };
  window._dxrFinDelete=function(btn){ var tr=btn&&btn.parentNode&&btn.parentNode.parentNode; if(!tr||!tr.parentNode) return; if(!window.confirm('Confirm deletion\n\nAre you sure you want to delete this financial row?')) return; tr.parentNode.removeChild(tr); window._dxrFinRecalc(); try{ _dxrFinPersist(); }catch(e){} };
  window._dxrFinAdd=function(){
    var card=document.getElementById('dxr-fin-card'); if(!card) return;
    var tb=card.querySelector('tbody'); if(!tb) return;
    var er=tb.querySelector('tr.dxr-fe-empty'); if(er) er.parentNode.removeChild(er);
    var master=(_cur&&_cur.masterPnr)||'';
    var tr=document.createElement('tr'); tr.className='dxr-fe-row dxr-filterable'; tr.setAttribute('data-id','new-'+Date.now());
    tr.innerHTML=_finCells({ trecho:'', prog:'', forn:'', pnr:master, miles:'', cpm:'', tax:'', extra:'', sub:0 });
    tb.appendChild(tr); window._dxrFinRecalc(); try{ _dxrFinPersist(); }catch(e){}
    var f=tr.querySelector('input'); if(f&&f.focus) try{ f.focus(); }catch(e){}
  };
  window._dxrFinEditConfirm=function(el){
    if(!window.confirm('This update will synchronize Supplier, Financial and Dossier records.\n\nContinue?')){ if(el.hasAttribute('data-orig')) el.value=el.getAttribute('data-orig'); window._dxrFinRecalc(); return; }
    el.setAttribute('data-orig', el.value); window._dxrFinRecalc(); try{ _dxrFinPersist(); }catch(e){}
  };
  /* Persist DOM rows back to the finance ledger (single source) — no number is
     pulled from Cost Calculator; this view IS the editable source of truth. */
  function _dxrFinPersist(){
    if(!_cur) return; var ref=_cur.ref;
    var card=document.getElementById('dxr-fin-card'); if(!card) return;
    var rows=card.querySelectorAll('tbody tr.dxr-fe-row');
    var all; try{ all=JSON.parse(localStorage.getItem('expatur_financeiro_lancamentos')||'[]'); }catch(e){ all=[]; }
    if(!Array.isArray(all)) all=[];
    var others=all.filter(function(l){ return !l || String(l.dossierRef||'')!==String(ref); });
    var existing={}; all.forEach(function(l){ if(l&&String(l.dossierRef||'')===String(ref)){ var k=l.id||l.source_id; if(k) existing[k]=l; } });
    var out=[];
    Array.prototype.forEach.call(rows,function(tr){
      function val(f){ var el=tr.querySelector('[data-f="'+f+'"]'); return el?el.value:''; }
      var id=tr.getAttribute('data-id'); var base=existing[id]||{};
      var miles=_num(val('miles')),cpm=_num(val('cpm')),tax=_num(val('taxas')),extra=_num(val('extra'));
      var sub=miles/1000*cpm+tax+extra;
      var rec={}; for(var k in base){ if(Object.prototype.hasOwnProperty.call(base,k)) rec[k]=base[k]; }
      rec.id=(id&&id.indexOf('new')!==0)?id:(base.id||('cf-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)));
      rec.dossierRef=ref; rec.source_type=base.source_type||'cost_calculator_line';
      rec.fornecedor=val('fornecedor'); rec.programme=val('programme'); rec.trecho=val('trecho');
      rec.linked_pnr=(val('pnr')||'').toUpperCase();
      rec.volume_miles=miles; rec.cpm_brl=cpm; rec.taxas_brl=tax; rec.extra_brl=extra;
      rec.brl_amount=sub; rec.amount_brl=sub; rec.valor=sub; rec.moeda='R$';
      tr.setAttribute('data-id', rec.id); out.push(rec);
    });
    try{ localStorage.setItem('expatur_financeiro_lancamentos', JSON.stringify(others.concat(out))); }catch(e){}
    if(_cur) _cur.fin=out;
  }
  window._dxrFinPersist=_dxrFinPersist;
  var _dxrFinT=null;
  function _dxrFinPersistDebounced(){ if(_dxrFinT) clearTimeout(_dxrFinT); _dxrFinT=setTimeout(function(){ try{ _dxrFinPersist(); }catch(e){} }, 500); }

  /* Dropdown sources: Fournisseur ← suppliers menu, Programme ← FFP menu */
  function _supList(){ var a=_json('expatur_fornecedores',[]); if(!Array.isArray(a)) a=[]; return a.map(function(f){ return f&&(f.nome||f.name)||''; }).filter(Boolean); }
  function _ffpList(){ var a=_json('expatur_ffp',[]); if(!Array.isArray(a)||!a.length) return ['Smiles','Copa','Latam Pass','Latam Tabela Fixa','Air France','APM','Azul Fidelidade','QR Privilege Club','Consolidator','VISA / E.T.A','Volta Cancelada']; return a.map(function(f){ return f&&(f.name||f.nome)||''; }).filter(Boolean); }
  /* Trecho options = itinerary legs from Ticketing/Pricing (single source). */
  function _legRouteOpts(){ var L=(_cur&&_cur.legs)||[]; var out=[]; L.forEach(function(l){ var dep=(l.dep||'').toUpperCase(), arr=(l.arr||'').toUpperCase(); if(dep||arr) out.push(dep+' \u2192 '+arr); }); return out; }
  function _optsHtml(list,cur){ var seen={},out='',has=false; (list||[]).forEach(function(n){ n=String(n); if(seen[n]) return; seen[n]=1; var sel=(n===String(cur));  if(sel) has=true; out+='<option value="'+_esc(n)+'"'+(sel?' selected':'')+'>'+_esc(n)+'</option>'; }); if(cur&&!has) out='<option value="'+_esc(cur)+'" selected>'+_esc(cur)+'</option>'+out; return out; }
  function _ravBrutVal(g){ var r=(g&&g.rav)||{}; return (r.brut==null)?'\u2014':_brl(r.brut); }

  /* Header SAVE — persist edits + propagate to other flux (ledger, suppliers, NF) */
  window._dxrSaveAll=function(){
    /* Persist + propagate to every linked entity (single source of truth):
       Financial ledger \u2192 Supplier records \u2192 Dossier \u2192 NF/Invoice \u2192 Tasks. */
    try{ if(typeof _dxrFinPersist==='function') _dxrFinPersist(); }catch(e){}
    try{ var nf=document.getElementById('dxr-nf-input'); if(nf&&window._dxrSaveNF) window._dxrSaveNF(nf.value); }catch(e){}
    try{ if(_cur&&typeof _dxrSyncSuppliers==='function') _dxrSyncSuppliers(_cur.ref); }catch(e){}
    ['_reconcileFinanceiro','renderTasks','tasksRender','recapRefresh','fornRender','dispRender','renderDossierTabs'].forEach(function(fn){ try{ if(typeof window[fn]==='function') window[fn](); }catch(e){} });
    if(_cur) try{ window.openDossierDrawer(_cur.ref); }catch(e){}
    if(window.toast) toast('Enregistr\u00e9 \u2014 Dossier, Fournisseur, Financier, Facture & T\u00e2ches synchronis\u00e9s','success');
  };
  /* Re-render the open drawer body from the live single-source stores (tasks, fin, NF). */
  window._dxrRefresh=function(){ try{ if(!_cur) return; _cur=_gather(_cur.ref); var body=document.getElementById('dxr-body'); if(body) body.innerHTML=_travel(_cur)+_fin(_cur)+_taskSec(_cur)+_history(_cur); }catch(e){} };

  function _card(title,inner,extra){ return '<div class="dxr-card'+(extra?' '+extra:'')+'"><div class="dxr-card-t">'+title+'</div>'+inner+'</div>'; }

  function _hdr(g){
    var mc=(g.marginBRL!=null)?(g.marginBRL>=0?'#16a34a':'#dc2626'):'#9aa7b4';
    return ''
      +'<div class="dxr-hdr-row">'
      + '<div>'
      +   '<div class="dxr-num">'+_esc(g.ref)+' <span class="dxr-num-sep">/</span> <span class="dxr-deal" title="Deal Value">'+_esc(g.dealStr)+'</span></div>'
      +   '<div class="dxr-sub"><span class="dxr-cli-link" onclick="window._dxrClient()" title="Voir la fiche client">'+_esc((g.pax[0]&&g.pax[0].name)||g.f['pax-name-1']||'—')+'</span>'
      +     ' &nbsp;·&nbsp; Booked on '+_fmtDDMMMYY(g.bookedAt)+'</div>'
      +   '<div class="dxr-badges">'+_badge(g.booked,'BOOKED','#0ea5e9')+_badge(g.issued,'ISSUED','#16a34a')+_payChip(g)+_nfChip(g)+'</div>'
      + '</div>'
      +'</div>';
  }

  function _travel(g){
    var cabin=g.f['travel-class']||'';
    var master=(g.bil&&g.bil.masterPnr)||'';
    function legAir(l){ return String(l.airline||(typeof _iata==='function'?_iata(l.fn):'')||'').toUpperCase(); }
    function legPnr(l){ return String(l.pnr||'').toUpperCase()||master||((g.pnrs[0]&&g.pnrs[0].pnr)||''); }
    function logoFor(l){ return (typeof window.getAirlineLogoUrl==='function')?window.getAirlineLogoUrl({fn:l.fn,iata:legAir(l),airline:l.airline}):''; }
    function _dt(dateStr,hhmm){ if(!hhmm) return null; var hm=String(hhmm).match(/(\d{1,2}):(\d{2})/); if(!hm) return null; var base=dateStr?Date.parse(dateStr):NaN; var d=isNaN(base)?new Date(2000,0,1):new Date(base); d.setHours(+hm[1],+hm[2],0,0); return d.getTime(); }
    function legDuration(l){ var dep=_dt(l.date,l.depTime),arr=_dt(l.date,l.arrTime); if(dep==null||arr==null) return ''; var mins=Math.round((arr-dep)/60000); if(mins<=0) mins+=1440; if(mins<=0||mins>1440*2) return ''; var h=Math.floor(mins/60),m=mins%60; return h+'h'+('0'+m).slice(-2); }
    function statusBadge(){ return _badge(g.issued, g.issued?'Ticketed':'Pending', g.issued?'#16a34a':'#d97706'); }

    /* A reservation = consecutive legs sharing the SAME PNR and the SAME airline.
       Distinct airlines or distinct PNRs are distinct reservations — each gets its
       own column and its own passenger box. Each leg keeps its global index so we
       can attach the right passengers (and their per-leg e-tickets) to it. */
    var groups=[], gmap={};
    (g.legs||[]).forEach(function(l,i){ l.__li=i; var key=(legPnr(l)||'\u2014')+'|'+(legAir(l)||''); var grp=gmap[key]; if(!grp){ grp={pnr:legPnr(l)||'\u2014',air:legAir(l),legs:[],legIdx:[],pax:[]}; gmap[key]=grp; groups.push(grp); } grp.legs.push(l); grp.legIdx.push(i); });
    (g.pax||[]).forEach(function(p,ix){ p.__i=ix; });
    function _asg(o,a,b){ var r={}; var k; for(k in o) r[k]=o[k]; for(k in a) r[k]=a[k]; for(k in b) r[k]=b[k]; return r; }
    /* A passenger belongs to every reservation they hold an e-ticket on (per-leg
       etkt index), shown under that column with that reservation's ticket. Falls
       back to a PNR match, then to the first reservation. */
    function _paxFor(p,grp){ var tk=(grp.legIdx||[]).map(function(li){ return (p.etktsRaw||[])[li]; }).filter(Boolean); return _asg(p,{},{tickets: tk.length?tk:(p.tickets||[])}); }
    var unassigned=[];
    (g.pax||[]).forEach(function(p){
      var hit=false;
      groups.forEach(function(grp){
        var byEtkt=(grp.legIdx||[]).some(function(li){ var e=(p.etktsRaw||[])[li]; return !!(e&&String(e).trim()); });
        var byPnr=p.pnr&&String(p.pnr).toUpperCase()===String(grp.pnr).toUpperCase();
        if(byEtkt||byPnr){ grp.pax.push(_paxFor(p,grp)); hit=true; }
      });
      if(!hit) unassigned.push(p);
    });
    if(unassigned.length){ if(!groups.length) groups.push({pnr:master||'\u2014',air:'',legs:[],legIdx:[],pax:[]}); var tgt=groups[0]; unassigned.forEach(function(p){ tgt.pax.push(p); }); }
    if(!groups.length) groups.push({pnr:master||'\u2014',air:'',legs:[],legIdx:[],pax:(g.pax||[]).slice()});

    function logoCell(l){
      var logo=logoFor(l), code=legAir(l);
      return '<div class="dxr-iti-logo"><span class="dxr-arail">'
        + (logo?'<img class="dxr-alogo" src="'+logo+'" onerror="this.style.display=\'none\';var c=this.parentNode.querySelector(\'.dxr-acode\');if(c)c.style.display=\'flex\';">':'')
        + '<span class="dxr-acode"'+(logo?' style="display:none;"':'')+'>'+(code||'\u2708')+'</span></span></div>';
    }
    function _hm(t){ var m=String(t||'').match(/(\d{1,2}:\d{2})/); return m?m[1]:String(t||''); }
    function metaOf(l){ return '<div class="dxr-seg-meta">'+(l.fn?'<span><b>'+_esc(l.fn)+'</b></span>':'')+(l.date?'<span>'+_fmtD(l.date)+'</span>':'')+(l.depTime?'<span>Dep '+_esc(_hm(l.depTime))+'</span>':'')+(l.arrTime?'<span>Arr '+_esc(_hm(l.arrTime))+'</span>':'')+(cabin?'<span>'+_esc(cabin)+'</span>':'')+'</div>'; }

    /* One itinerary block: header (overall DEP\u2192ARR + one airline / PNR / status)
       and, for connections, a per-leg indented breakdown. Logo on the left,
       vertically centered with the block. Direct one-way keeps its meta line. */
    function block(legs, pnr){
      if(!legs.length) return '';
      /* Expand each billet leg into its individual flights so a connection is
         NEVER collapsed onto one line. Prefer real per-segment data; if a leg
         only carries the combined flight-number string ("LX 645 + LX 92"),
         split that and keep the known outer endpoints/times. */
      var sub=[];
      legs.forEach(function(l){
        if(l.segments && l.segments.length>1){
          l.segments.forEach(function(s){ sub.push({ dep:String(s.depCode||s.dep||'').toUpperCase(), arr:String(s.arrCode||s.arr||'').toUpperCase(), fn:s.fn||'', airline:s.airline||l.airline||'', depTime:s.depTime||'', arrTime:s.arrTime||'', date:s.depDate||l.date||'', dur:(s.durStr||(typeof s.durMin==='number'&&s.durMin>0?(Math.floor(s.durMin/60)+'h'+('0'+(s.durMin%60)).slice(-2)):'')) }); });
        } else {
          var fns=String(l.fn||'').split('+').map(function(x){return x.trim();}).filter(Boolean);
          if(fns.length>1){
            fns.forEach(function(fp,i){ sub.push({ fn:fp, airline:l.airline||'', dep:(i===0?String(l.dep||'').toUpperCase():''), arr:(i===fns.length-1?String(l.arr||'').toUpperCase():''), depTime:(i===0?(l.depTime||''):''), arrTime:(i===fns.length-1?(l.arrTime||''):''), date:l.date||'', dur:'' }); });
          } else { sub.push(l); }
        }
      });
      var air=legAir(sub[0]||legs[0]);
      var depO=(sub[0]&&sub[0].dep)||String(legs[0].dep||'').toUpperCase()||'???', arrO=(sub[sub.length-1]&&sub[sub.length-1].arr)||String(legs[legs.length-1].arr||'').toUpperCase()||'???';
      var head='<div class="dxr-iti-head"><span class="dxr-iti-route">'+_esc(depO)+' <span class="dxr-arrow">\u2192</span> '+_esc(arrO)+'</span>'
        + '<span class="dxr-iti-meta-air"><span class="dxr-seg-air">'+_esc(air||'\u2014')+'</span> / <span class="dxr-pnr-code2">'+_esc(pnr||'\u2014')+'</span> '+statusBadge()+'</span></div>';
      var bodyInner;
      if(sub.length<=1){
        bodyInner = head + metaOf(sub[0]||legs[0]||{});      /* DIRECT \u2014 single flight */
      } else {
        var legLines = sub.map(function(s){
          var dur=s.dur||legDuration(s);
          var dp=(s.dep||s.depTime)?('<span class="dxr-iti-pt">'+_esc(s.dep||'')+' '+_esc(_hm(s.depTime))+'</span>'):'';
          var ap=(s.arr||s.arrTime)?('<span class="dxr-iti-pt">'+_esc(s.arr||'')+' '+_esc(_hm(s.arrTime))+'</span>'):'';
          var ar=(dp&&ap)?'<span class="dxr-arrow">\u2192</span>':'';
          return '<div class="dxr-iti-leg"><span class="dxr-iti-fn">'+_esc(s.fn||'\u2014')+'</span>'+dp+ar+ap+(dur?'<span class="dxr-iti-dur">('+dur+')</span>':'')+'</div>';
        }).join('');
        bodyInner = head + '<div class="dxr-iti-legs">'+legLines+'</div>';
      }
      var ds=(sub.map(function(s){return (s.fn||'')+' '+(s.dep||'')+' '+(s.arr||'');}).join(' ')+' '+pnr).toLowerCase();
      return '<div class="dxr-iti dxr-filterable" data-s="'+_esc(ds)+'">'+logoCell(sub[0]||legs[0])+'<div class="dxr-iti-body">'+bodyInner+'</div></div>';
    }
    function paxCard(p){
      return '<div class="dxr-paxc dxr-filterable" data-s="'+_esc((p.name+' '+(p.tickets||[]).join(' ')).toLowerCase())+'">'
        + '<div class="dxr-paxc-l"><div class="dxr-paxc-name" onclick="window._dxrPassport('+(p.__i||0)+')" title="'+_esc(p.name)+' \u2014 Voir le passager">'+_esc(p.name)+'</div>'
        +   '<div class="dxr-paxc-tk">'+(p.tickets&&p.tickets.length?_esc(p.tickets.join(', ')):'Billet \u2014')+'</div></div>'
        + '<div class="dxr-paxc-cat" title="Cat\u00e9gorie passager">'+_paxCat(p.type)+'</div></div>';
    }
    function paxSection(pax){
      return '<div class="dxr-sub-t dxr-vgroup-pax">'+_paxLabel(pax.length)+'</div>'
        + '<div class="dxr-pax-grid">'+(pax.length?pax.map(paxCard).join(''):'<div class="dxr-empty">Aucun passager.</div>')+'</div>';
    }
    function splitRT(legs){
      if(legs.length<2) return {out:legs.slice(), ret:[]};
      var dest=String((g.f&&(g.f['arr1']||g.f['arr-1']))||'').toUpperCase();
      if(dest){ for(var i=0;i<legs.length-1;i++){ if(String(legs[i].arr||'').toUpperCase()===dest) return {out:legs.slice(0,i+1), ret:legs.slice(i+1)}; } }
      var h=Math.ceil(legs.length/2); return {out:legs.slice(0,h), ret:legs.slice(h)};
    }
    /* Split a single PNR's legs into journeys (city-pairs): a journey continues
       while arr[i] == dep[i+1] (a connection) and breaks at a new city-pair. */
    /* Split legs into journeys. A journey continues only while the next leg is
       contiguous (arr==dep) AND on the SAME airline. A different airline means a
       separate flight/reservation (multi-city / open-jaw) — never merge those
       into one connection block. */
    function journeys(legs){ var out=[],cur=[]; (legs||[]).forEach(function(l){ if(cur.length){ var prev=cur[cur.length-1]; var contiguous=String(prev.arr||'').toUpperCase()===String(l.dep||'').toUpperCase(); var sameAir=legAir(prev)===legAir(l); if(!contiguous||!sameAir){ out.push(cur); cur=[]; } } cur.push(l); }); if(cur.length) out.push(cur); return out; }

    /* Flatten multi-segment legs into individual flights so round-trip detection
       and the outbound/return split work even when a leg carries its segments. */
    var _rtDest=String((g.f&&(g.f['arr1']||g.f['arr-1']))||'').toUpperCase();
    var _flat=function(ls){ var o=[]; (ls||[]).forEach(function(l){ if(l.segments&&l.segments.length>1){ l.segments.forEach(function(s){ o.push({dep:String(s.depCode||s.dep||'').toUpperCase(),arr:String(s.arrCode||s.arr||'').toUpperCase(),fn:s.fn||'',airline:s.airline||l.airline||'',depTime:s.depTime||'',arrTime:s.arrTime||'',date:s.depDate||l.date||'',durStr:s.durStr||'',pnr:l.pnr||''}); }); } else { var _fns=String(l.fn||'').split('+').map(function(x){return x.trim();}).filter(Boolean); if(_fns.length>1){ _fns.forEach(function(fp,i){ o.push({ fn:fp, airline:l.airline||'', dep:(i===0?String(l.dep||'').toUpperCase():_rtDest), arr:(i===_fns.length-1?String(l.arr||'').toUpperCase():_rtDest), depTime:(i===0?(l.depTime||''):''), arrTime:(i===_fns.length-1?(l.arrTime||''):''), date:l.date||'', durStr:'', pnr:l.pnr||'' }); }); } else { o.push(l); } } }); return o; };
    var type=g.type||'';
    var allLegs=groups.reduce(function(a,grp){return a.concat(grp.legs);},[]);
    var rtLegs=_flat(allLegs), _rf=rtLegs[0], _rl=rtLegs[rtLegs.length-1];
    var returnsToOrigin = rtLegs.length>=2 && _rf && _rl && !!String(_rf.dep||'').toUpperCase() && String(_rf.dep||'').toUpperCase()===String(_rl.arr||'').toUpperCase();
    var isMC=/multi|jaw/i.test(type);
    /* A round trip ends where it started (single reservation). Detect it even if
       the type label is wrong, but never override a genuine multi-city. */
    var isRT=/round|retour|aller.?retour/i.test(type) || (returnsToOrigin && !/multi/i.test(type) && groups.length===1);
    var inner;

    if(isRT && rtLegs.length>=2){
      /* Round-trip = ONE reservation: outbound left, return right; each column
         uses the connecting-flight display; a SINGLE shared pax box below.
         Never render a round-trip as one connection block. */
      var sp=splitRT(rtLegs), pnr=(groups[0]&&groups[0].pnr)||((g.pnrs[0]&&g.pnrs[0].pnr)||'\u2014');
      inner='<div class="dxr-iti-cols">'
        + '<div class="dxr-iti-col"><div class="dxr-iti-coltag">Aller</div>'+block(sp.out,pnr)+'</div>'
        + '<div class="dxr-iti-col"><div class="dxr-iti-coltag">Retour</div>'+(sp.ret.length?block(sp.ret,pnr):'<div class="dxr-empty">\u2014</div>')+'</div>'
        + '</div>' + paxSection(g.pax||[]);
    } else if(groups.length>1){
      /* Multiple PNRs (multi-city / open-jaw with distinct reservations): one
         column per reservation. Each reservation's legs are themselves split into
         journeys (so a mixed-airline pair never collapses), and each column gets
         its OWN pax box beneath it (side by side, never shared across PNRs). */
      inner='<div class="dxr-iti-cols">'+groups.map(function(grp,i){
        var jb=journeys(grp.legs).map(function(j){ return block(j,grp.pnr); }).join('');
        return '<div class="dxr-iti-col"><div class="dxr-iti-coltag">Trajet '+(i+1)+'</div>'+jb+'<div class="dxr-iti-pax">'+paxSection(grp.pax)+'</div></div>';
      }).join('')+'</div>';
    } else {
      /* Single PNR: split into journeys (city-pairs / airline changes). If it
         yields more than one journey (multi-city / open-jaw), show columns; a
         single same-airline connection stays one block. Pax shared below. */
      var grp=groups[0], js=journeys(grp.legs);
      if(js.length>1){
        inner='<div class="dxr-iti-cols">'+js.map(function(j,i){ return '<div class="dxr-iti-col"><div class="dxr-iti-coltag">Trajet '+(i+1)+'</div>'+block(j,grp.pnr)+'</div>'; }).join('')+'</div>' + paxSection(grp.pax);
      } else {
        inner = block(grp.legs, grp.pnr) + paxSection(grp.pax);
      }
    }
    return _card('Itin\u00e9raire', inner, 'dxr-std');
  }

  function _summary(g){
    function c(l,v){ return '<div class="dxr-sc"><div class="dxr-sc-v">'+v+'</div><div class="dxr-sc-l">'+l+'</div></div>'; }
    return '<div class="dxr-sc-row">'
      + c('Passengers', g.pax.length+' Pax')
      + c('Flights', _esc(g.type))
      + c('Miles Used', (g.milesTotal||0).toLocaleString('pt-BR'))
      + c('PNRs', g.pnrs.length)
      + c('Repasse Total', _brl(g.repasse))
      + '</div>';
  }

  function _trip(g){
    if (!g.legs.length) return _card('Itin\u00e9raire','<div class="dxr-empty">Aucun segment.</div>');
    var cabin=g.f['travel-class']||'';
    var master=(g.bil&&g.bil.masterPnr)||'';
    var html='<div class="dxr-trip">';
    g.legs.forEach(function(l,i){
      var logo=(typeof window.getAirlineLogoUrl==='function')?window.getAirlineLogoUrl({fn:l.fn,iata:l.airline,airline:l.airline}):'';
      var code=_esc(String(l.airline||'').slice(0,3).toUpperCase());
      var legPnr=l.pnr||master||((g.pnrs[0]&&g.pnrs[0].pnr)||'');
      var pnrLine='<div class="dxr-seg-pnr">'+(l.airline?'<b>'+_esc(l.airline)+'</b> / ':'')+'<span class="dxr-pnr-code2">'+(legPnr?_esc(legPnr):'\u2014')+'</span> '
        + _badge(g.issued,g.issued?'Ticketed':'Pending',g.issued?'#16a34a':'#d97706')+'</div>';
      html+='<div class="dxr-seg dxr-filterable" data-s="'+_esc((l.fn||'')+' '+(l.dep||'')+' '+(l.arr||'')+' '+(legPnr||'')).toLowerCase()+'">'
        + '<div class="dxr-seg-rail"><span class="dxr-arail"><span class="dxr-acode">'+(code||'\u2708')+'</span>'+(logo?'<img class="dxr-alogo" src="'+logo+'" alt="'+_esc(l.airline||'')+'" onerror="this.style.display=\'none\'">':'')+'</span>'+(i<g.legs.length-1?'<span class="dxr-line"></span>':'')+'</div>'
        + '<div class="dxr-seg-body">'
        +   '<div class="dxr-seg-route">'+_esc(l.dep||'???')+' <span class="dxr-arrow">\u2192</span> '+_esc(l.arr||'???')+'</div>'
        +   pnrLine
        +   '<div class="dxr-seg-meta">'
        +     (l.fn?'<span><b>'+_esc(l.fn)+'</b></span>':'')
        +     (l.date?'<span>'+_fmtD(l.date)+'</span>':'')
        +     (l.depTime?'<span>Dep '+_esc(l.depTime)+'</span>':'')
        +     (l.arrTime?'<span>Arr '+_esc(l.arrTime)+'</span>':'')
        +     (cabin?'<span>'+_esc(cabin)+'</span>':'')
        +   '</div>'
        + '</div></div>';
    });
    html+='</div>';
    return _card('Itin\u00e9raire \u00b7 '+_esc(g.type), html);
  }

  function _paxType(t){ t=String(t||'').toLowerCase(); if(t.indexOf('inf')>=0||t.indexOf('beb')>=0) return 'Bébé (INF)'; if(t.indexOf('chd')>=0||t.indexOf('enf')>=0||t.indexOf('child')>=0) return 'Enfant (CHD)'; if(t.indexOf('adt')>=0||t.indexOf('adu')>=0) return 'Adulte (ADT)'; return t?_esc(t):'Adulte (ADT)'; }
  function _paxSec(g){
    if (!g.pax.length) return '';
    var cards=g.pax.map(function(p,i){
      return '<div class="dxr-pax dxr-filterable" data-s="'+_esc((p.name+' '+(p.tickets||[]).join(' ')+' '+(p.pnr||'')).toLowerCase())+'">'
        + '<div class="dxr-pax-top"><div class="dxr-pax-n">'+_esc(p.name)+'</div></div>'
        + '<div class="dxr-pax-r"><span>Date de naissance</span><b>'+(p.dob?_fmtD(p.dob):'\u2014')+'</b></div>'
        + '<div class="dxr-pax-r"><span>Type passager</span><b>'+_paxType(p.type)+'</b></div>'
        + '<div class="dxr-pax-r"><span>N° billet</span><b>'+(p.tickets&&p.tickets.length?_esc(p.tickets.join(', ')):'\u2014')+'</b></div>'
        + '</div>';
    }).join('');
    return _card(_paxLabel(g.pax.length),'<div class="dxr-grid">'+cards+'</div>');
  }

  function _pnrSec(g){
    if (!g.pnrs.length) return '';
    var cards=g.pnrs.map(function(p,i){
      return '<div class="dxr-pnr dxr-filterable" data-s="'+_esc(((p.airline||'')+' '+p.pnr).toLowerCase())+'" onclick="this.classList.toggle(\'open\')">'
        + '<div class="dxr-pnr-h"><div class="dxr-pnr-code">'+(p.airline?'<b>'+_esc(p.airline)+'</b> / ':'')+_esc(p.pnr)+'</div>'+_badge(g.issued,g.issued?'Ticketed':'Pending',g.issued?'#16a34a':'#d97706')+'</div>'
        + '<div class="dxr-pnr-meta">'+(p.seg||1)+' segment'+((p.seg||1)>1?'s':'')+'</div>'
        + '</div>';
    }).join('');
    return _card('PNRs ('+g.pnrs.length+')','<div class="dxr-grid">'+cards+'</div>');
  }

  function _fin(g){
    /* ── FINANCIAL BREAKDOWN (editable, CloudFare-synced) ──
       Rows are editable (value / delete / add). The Cost-Calculator formula is
       conserved on edit: Sous-total = Volume/1000 × C.P.M + Taxas + Extra.
       Values are NOT re-synced from Cost Calculator — this table is the editable
       view and persists back to the ledger (single source). PNR-linked,
       de-duplicated per (supplier,PNR). No CPM average, no Payment Method column. */
    var p=g.pnl||null, cur=g.cur||'', master=g.masterPnr||'';
    var fullRoute=(g.legs&&g.legs.length)?((g.legs[0].dep||'')+' \u2192 '+(g.legs[g.legs.length-1].arr||'')):'';
    function _miles(l){ return _num(l.volume_miles!=null?l.volume_miles:l.miles); }
    function _rawCpm(l){ return _num(l.cpm_brl!=null?l.cpm_brl:l.cpm); }
    function _taxas(l){ return _num(l.taxas_brl!=null?l.taxas_brl:l.taxas); }
    function _extra(l){ if(l.extra_brl!=null) return _num(l.extra_brl); if(l.extra!=null) return _num(l.extra); var r=_lineAmt(l)-(_miles(l)/1000*_rawCpm(l))-_taxas(l); return Math.abs(r)<0.005?0:r; }
    function _trecho(l){ if(l.trecho) return l.trecho; if(l.linked_leg_dep&&l.linked_leg_arr){ var t=l.linked_leg_dep+' \u2192 '+l.linked_leg_arr; if(l.linked_leg_fn) t+=' \u00b7 '+l.linked_leg_fn; return t; } if(l.linked_leg_label) return l.linked_leg_label; return fullRoute||''; }
    function _prog(l){ return l.programme||l.programa||''; }
    function _forn(l){ return l.fornecedor||l.supplier||''; }
    function _pnr(l){ return String(l.linked_pnr||l.pnr||master||'').toUpperCase(); }

    /* De-duplicate per (supplier, PNR): reuse the existing row (1 PNR → 1 row). */
    var lines=(g.fin&&g.fin.length)?g.fin:[];
    var order=[], byKey={};
    lines.forEach(function(l){
      var pnr=_pnr(l), forn=_forn(l), key=forn.toLowerCase()+'|'+pnr;
      var row=byKey[key];
      if(!row){ row={ id:(l.id||l.source_id||('cf-'+order.length)), trecho:_trecho(l), prog:_prog(l), forn:forn, pnr:pnr, miles:0, tax:0, extra:0, sub:0, milesCost:0 }; byKey[key]=row; order.push(key); }
      row.miles+=_miles(l); row.tax+=_taxas(l); row.extra+=_extra(l); row.sub+=_lineAmt(l); row.milesCost+=_miles(l)/1000*_rawCpm(l);
    });
    var sumMiles=0,sumTax=0,sumExtra=0,sumSub=0,sumMilesCost=0;
    var rows=order.map(function(key){
      var r=byKey[key];
      var cpm=r.miles>0?(Math.round(r.milesCost/r.miles*1000*10000)/10000):0;   /* per-row CPM only */
      sumMiles+=r.miles; sumTax+=r.tax; sumExtra+=r.extra; sumSub+=r.sub; sumMilesCost+=r.milesCost;
      return '<tr class="dxr-fe-row dxr-filterable" data-id="'+_esc(r.id)+'" data-s="'+_esc((r.trecho+' '+r.prog+' '+r.forn+' '+r.pnr).toLowerCase())+'">'
        + _finCells({ trecho:r.trecho, prog:r.prog, forn:r.forn, pnr:r.pnr, miles:r.miles, cpm:cpm, tax:r.tax, extra:r.extra, sub:r.sub }) + '</tr>';
    }).join('');
    if (!rows) rows='<tr class="dxr-fe-empty"><td colspan="10" class="dxr-empty">Aucune ligne. Cliquez \u00ab + Ajouter une ligne \u00bb.</td></tr>';

    var payFee=(p&&p.payFee!=null)?_num(p.payFee):0;
    var supplierCost=sumSub;
    var foot='<tr class="dxr-snap-total"><td colspan="3">Totaux</td><td></td>'
      +   '<td class="dxr-num-c" id="dxr-tot-miles">'+(sumMiles?sumMiles.toLocaleString('pt-BR'):'\u2014')+'</td>'
      +   '<td class="dxr-num-c">\u2014</td>'
      +   '<td class="dxr-num-c" id="dxr-tot-tax">'+_brl(sumTax)+'</td>'
      +   '<td class="dxr-num-c" id="dxr-tot-extra">'+(sumExtra?_brl(sumExtra):'\u2014')+'</td>'
      +   '<td class="dxr-num-c dxr-snap-sub" id="dxr-tot-sub">'+_brl(sumSub)+'</td><td></td></tr>';

    var rate=(p&&p.rate!=null)?_num(p.rate):null;
    var cap=(rate&&cur&&cur!=='R$')?'<div class="dxr-snap-cap">Devise '+_esc(cur)+' \u00b7 conversion '+_esc(cur)+' \u2192 BRL '+rate.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' (moteur financier CloudFare)</div>':'';

    var table='<div class="dxr-snap-wrap"><table class="dxr-snap"><thead><tr>'
      + '<th>Trecho</th><th>Programme</th><th>Fournisseur</th><th>PNR</th><th class="dxr-num-c">Volume (miles)</th><th class="dxr-num-c">C.P.M (R$)</th><th class="dxr-num-c">Taxas (R$)</th><th class="dxr-num-c">Extra (R$)</th><th class="dxr-num-c">Sous-total</th><th></th>'
      + '</tr></thead><tbody>'+rows+'</tbody><tfoot>'+foot+'</tfoot></table></div>';
    var addBtn='<button class="dxr-mini dxr-fe-add" onclick="window._dxrFinAdd()">+ Ajouter une ligne</button>';

    function cfbMain(l,v){ return '<div class="dxr-cfb-main"><span>'+l+'</span><b>'+v+'</b></div>'; }
    function cfbSub(l,v){ return '<div class="dxr-cfb-sub"><span>'+l+'</span><b>'+v+'</b></div>'; }
    var costblock='<div class="dxr-cfb"><div class="dxr-cfb-grid">'
      + cfbMain('Co\u00fbt fournisseur', '<span id="dxr-cb-supplier">'+_brl(supplierCost)+'</span>')
      + cfbSub('dont miles', '<span id="dxr-cb-miles">'+_brl(sumMilesCost)+'</span>')
      + cfbSub('dont taxes', '<span id="dxr-cb-taxes">'+_brl(sumTax)+'</span>')
      + cfbMain('Frais de paiement', payFee?_brl(payFee):'\u2014')
      + '</div></div>';
    var ravblock='<div class="dxr-rav">'
      + '<div class="dxr-rav-row"><span>RAV brut</span><b class="dxr-rav-brut" id="dxr-rav-brut-v">'+_ravBrutStr(g)+'</b></div>'
      + '<div class="dxr-rav-row"><span>RAV nette estim\u00e9e</span><b class="dxr-rav-net" id="dxr-rav-net-v">'+_ravTribStr(g)+'</b></div>'
      + '</div>';

    var _rb=(p&&p.ravBrut!=null)?_num(p.ravBrut):'', _nr=(p&&p.netRAV!=null)?_num(p.netRAV):'',
        _tc=(p&&p.totalCost!=null)?_num(p.totalCost):supplierCost,
        _gm=(p&&p.grossMarg!=null)?_num(p.grossMarg):'', _nm=(p&&p.netMarg!=null)?_num(p.netMarg):'';
    var wrap='<div id="dxr-fin-card" data-ravbrut="'+_rb+'" data-netrav="'+_nr+'" data-totalcost="'+_tc+'" data-grossmarg="'+_gm+'" data-netmarg="'+_nm+'">'
      + table+addBtn+cap+costblock+ravblock+'</div>';
    return _card('Financial Breakdown', wrap, 'dxr-fin');
  }

  /* FFP \u00b7 Yield Analysis — independent per-program profitability + executive summary */
  function _ffpSec(g){
    if (!g.ffp.length) return '';
    var ex=g.ffpExec;
    var exec = ex ? '<div class="dxr-ffp-exec">'
      + '<div class="dxr-ffp-ex"><span>Total miles</span><b>'+(ex.totalMiles||0).toLocaleString('pt-BR')+'</b></div>'
      + '<div class="dxr-ffp-ex"><span>Prix vente moyen pond\u00e9r\u00e9</span><b>R$ '+ex.wAvgSPP.toFixed(4)+' /mi</b></div>'
      + '<div class="dxr-ffp-ex"><span>Meilleur rendement</span><b>'+_esc(ex.highest?ex.highest.name:'\u2014')+'</b></div>'
      + '<div class="dxr-ffp-ex"><span>Plus faible rendement</span><b>'+_esc(ex.lowest?ex.lowest.name:'\u2014')+'</b></div>'
      + '<div class="dxr-ffp-ex"><span>Programmes</span><b>'+ex.count+'</b></div>'
      + '</div>' : '';
    var top=ex&&ex.highest?ex.highest.name:'';
    var cards=g.ffp.map(function(x){
      var yCol=x.marginMile>=0?'#16a34a':'#dc2626';
      return '<div class="dxr-ffp dxr-filterable" data-s="'+_esc(x.name.toLowerCase())+'">'
        + '<div class="dxr-ffp-h"><div class="dxr-ffp-n">'+_esc(x.name)+'</div>'+(x.name===top?'<span class="dxr-top">\u2605 Top yield</span>':'')+'</div>'
        + '<div class="dxr-ffp-g">'
        +   '<div><span>Miles utilis\u00e9s</span><b>'+(x.miles||0).toLocaleString('pt-BR')+'</b></div>'
        +   '<div><span>Revenu attribu\u00e9</span><b>'+_brl(x.revenue)+'</b></div>'
        +   '<div><span>Prix vente /mi</span><b>R$ '+x.sppm.toFixed(4)+'</b></div>'
        +   '<div><span>Co\u00fbt /mi (CPM '+(x.cpm?x.cpm.toFixed(1):'\u2014')+')</span><b>R$ '+x.cpmMile.toFixed(4)+'</b></div>'
        +   '<div><span>Rendement /mi</span><b style="color:'+yCol+';">R$ '+x.marginMile.toFixed(4)+'</b></div>'
        +   '<div><span>Co\u00fbt total</span><b>'+_brl(x.cost)+'</b></div>'
        + '</div></div>';
    }).join('');
    return _card('FFP \u00b7 Yield Analysis', exec+'<div class="dxr-grid">'+cards+'</div>');
  }

  /* Tasks — first-class section: KPI counts + list + create-from-dossier */
  function _taskSec(g){
    var tc=g.taskCounts||{total:0};
    var list=(g.tasks&&g.tasks.length)?g.tasks.map(function(t){
      var st=_taskStatus(t), lbl={open:'Open',waiting:'Waiting',inprogress:'In Progress',completed:'Completed'}[st];
      var col={open:'#0ea5e9',waiting:'#d97706',inprogress:'#6366f1',completed:'#16a34a'}[st];
      var tid=String(t.id!=null?t.id:'').replace(/'/g,"\\'");
      return '<div class="dxr-task dxr-filterable'+(t.done?' done':'')+'" data-s="'+_esc(((t.title||t.text||'')+' '+(t.cat||'')).toLowerCase())+'" onclick="window._dxrOpenTask(\''+tid+'\')" title="Ouvrir la t\u00e2che">'
        + '<div class="dxr-task-main"><div class="dxr-task-t">'+_esc(t.title||t.text||'\u2014')+'</div>'
        +   '<div class="dxr-task-m">'+(t.cat?'<span>'+_esc(t.cat)+'</span>':'')+(t.dueDate?'<span>\u23f1 '+_esc(String(t.dueDate).replace('T',' '))+'</span>':'')+'</div></div>'
        + '<span class="dxr-task-badge" style="background:'+col+';">'+lbl+'</span>'
        + '</div>';
    }).join(''):'<div class="dxr-empty">Aucune t\u00e2che li\u00e9e \u00e0 ce dossier.</div>';
    var form='<div id="dxr-newtask" style="display:none;" class="dxr-task-form">'
      + '<input id="dxr-nt-title" placeholder="Intitul\u00e9 de la t\u00e2che\u2026">'
      + '<select id="dxr-nt-cat"><option>Diversos</option><option>Check-in</option><option>Payments</option><option>Notas Fiscais</option><option>Facture</option><option>Volta Cancelada</option></select>'
      + '<input id="dxr-nt-due" type="datetime-local">'
      + '<button class="dxr-mini" onclick="window._dxrSaveTask()">Cr\u00e9er</button>'
      + '<button class="dxr-mini" onclick="document.getElementById(\'dxr-newtask\').style.display=\'none\'">Annuler</button>'
      + '</div>';
    var addBtn='<button class="dxr-mini" style="margin-bottom:10px;" onclick="document.getElementById(\'dxr-newtask\').style.display=\'flex\'">+ Nouvelle t\u00e2che</button>';
    return _card('T\u00e2ches ('+(tc.total||0)+')', addBtn+form+'<div class="dxr-task-grid">'+list+'</div>');
  }

  function _supSec(g){
    if (!g.suppliers.length) return '';
    var cards=g.suppliers.map(function(s){
      return '<div class="dxr-sup dxr-filterable" data-s="'+_esc(s.name.toLowerCase())+'">'
        + '<div class="dxr-sup-h"><div class="dxr-sup-n">'+_esc(s.name)+'</div>'+_badge(s.status==='pago','PAGO','#16a34a')+'</div>'
        + '<div class="dxr-sup-g"><div><span>Repasse</span><b>'+_brl(s.total)+'</b></div><div><span>Miles</span><b>'+(s.miles?s.miles.toLocaleString('pt-BR'):'—')+'</b></div><div><span>PNRs</span><b>'+(s.pnrCount||'—')+'</b></div><div><span>Lignes</span><b>'+s.n+'</b></div></div>'
        + '<button class="dxr-mini" onclick="window._dxrOpenSupplier(\''+_esc(s.name).replace(/'/g,"\\'")+'\')">Ouvrir fournisseur →</button>'
        + '</div>';
    }).join('');
    return _card('Fournisseurs ('+g.suppliers.length+')','<div class="dxr-grid">'+cards+'</div>');
  }

  function _ffpSec(g){
    if (!g.ffp.length) return '';
    var top=g.ffp[0]&&g.ffp[0].name;
    var cards=g.ffp.map(function(x){
      return '<div class="dxr-ffp dxr-filterable" data-s="'+_esc(x.name.toLowerCase())+'">'
        + '<div class="dxr-ffp-h"><div class="dxr-ffp-n">'+_esc(x.name)+'</div>'+(x.name===top?'<span class="dxr-top">★ Top</span>':'')+'</div>'
        + '<div class="dxr-ffp-g"><div><span>Miles</span><b>'+(x.miles||0).toLocaleString('pt-BR')+'</b></div><div><span>CPM</span><b>'+(x.cpm?x.cpm.toFixed(1):'—')+'</b></div><div><span>Coût</span><b>'+_brl(x.cost)+'</b></div></div>'
        + '</div>';
    }).join('');
    return _card('Programmes de fidélité (FFP)','<div class="dxr-grid">'+cards+'</div>');
  }

  function _nfSec(g){
    var num=(g.nf&&g.nf.number)||'';
    var inner='<div class="dxr-nf-edit"><label>N\u00b0 Nota Fiscal</label>'
      + '<input id="dxr-nf-input" value="'+_esc(num)+'" placeholder="Saisir le n\u00b0 NF\u2026" oninput="window._dxrNfDirty=true">'
      + '<button class="dxr-mini" onclick="window._dxrSaveNF(document.getElementById(\'dxr-nf-input\').value)">Enregistrer</button></div>';
    inner+='<div class="dxr-nf-g">'
      + '<div><span>Num\u00e9ro</span><b>'+(num?_esc(num):'')+'</b></div>'
      + '<div><span>Valeur N.F</span><b id="dxr-ravbrut-nf">'+_ravBrutVal(g)+'</b></div>'
      + '</div>';
    return _card('Nota Fiscal', inner, 'dxr-nf-col');
  }

  function _timeline(g){
    if (!g.acts.length) return '';
    var items=g.acts.map(function(a){
      var d=_dt(a.when);
      return '<div class="dxr-tl-i"><div class="dxr-tl-d">'+(d?(('0'+d.getDate()).slice(-2)+' '+MON[d.getMonth()]):'—')+'</div><div class="dxr-tl-dot"></div><div class="dxr-tl-l">'+_esc(a.label)+'</div></div>';
    }).join('');
    return _card('Historique','<div class="dxr-tl">'+items+'</div>');
  }

  function _history(g){
    var items=(g.acts&&g.acts.length)?g.acts.map(function(a){
      var d=_dt(a.when);
      return '<div class="dxr-tl-i"><div class="dxr-tl-d">'+(d?(('0'+d.getDate()).slice(-2)+' '+MON[d.getMonth()]):'\u2014')+'</div><div class="dxr-tl-dot"></div><div class="dxr-tl-l">'+_esc(a.label)+'</div></div>';
    }).join(''):'<div class="dxr-empty">Aucun \u00e9v\u00e9nement.</div>';
    var m=g.memo||{};
    var meta=(m.updatedAt)?('Modifi\u00e9 '+_fmtD(m.updatedAt)+(m.editor?(' \u00b7 '+_esc(m.editor)):'')):'Aucune note enregistr\u00e9e';
    var memoHtml=(m.html!=null)?m.html:'';
    var memo='<div class="dxr-memo-wrap">'
      + '<div class="dxr-memo-tb">'
      +   '<button onclick="window._dxrMemoCmd(\'insertUnorderedList\')" title="Liste \u00e0 puces">\u2022 Liste</button>'
      +   '<button onclick="window._dxrMemoCmd(\'bold\')" title="Gras"><b>B</b></button>'
      +   '<button onclick="window._dxrMemoCmd(\'italic\')" title="Italique"><i>I</i></button>'
      +   '<span class="dxr-memo-status" id="dxr-memo-status">'+meta+'</span>'
      + '</div>'
      + '<div id="dxr-memo" class="dxr-memo" contenteditable="true" oninput="window._dxrMemoDirty()" data-ph="\u2022 Attente facture fournisseur\u2026">'+memoHtml+'</div>'
      + '</div>';
    var topRow='<div class="dxr-hist-row">'
      + '<div class="dxr-nf-wrap">'+_nfSec(g)+'</div>'
      + _card('M\u00e9mo / To-Do',memo,'dxr-memo-card')
      + '</div>';
    var histCard=_card('Historique','<div class="dxr-tl">'+items+'</div>','dxr-hist-full');
    return topRow+histCard;
  }

  /* ───────────────── SHELL ───────────────── */
  function _ensureShell(){
    if (document.getElementById('dxr-overlay')) return;
    var st=document.createElement('style');
    st.textContent = [
      '#dxr-overlay{position:fixed;inset:0;z-index:9000;display:none;background:rgba(6,32,59,0.42);backdrop-filter:blur(2px);}',
      '#dxr-overlay.open{display:block;}',
      '#dxr-panel{position:absolute;top:0;right:0;height:100%;width:88%;max-width:1280px;background:#f4f6f9;box-shadow:-12px 0 40px rgba(0,0,0,0.25);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);}',
      '#dxr-overlay.open #dxr-panel{transform:translateX(0);}',
      '@media(max-width:640px){#dxr-panel{width:100%;}}',
      '.dxr-top{display:flex;align-items:center;gap:10px;}',
      '#dxr-head{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #e3e8ef;padding:14px 22px;}',
      '.dxr-head-bar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}',
      '.dxr-close{background:#eef2f7;border:1px solid #d8dee6;border-radius:8px;width:34px;height:34px;font-size:18px;cursor:pointer;color:#06203b;flex-shrink:0;}',
      '.dxr-num{font-size:1.5rem;font-weight:800;color:#06203b;letter-spacing:.02em;}',
      '.dxr-sub{font-size:.78rem;color:#3a5068;margin-top:3px;}',
      '.dxr-badges{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;}',
      '.dxr-badge{font-size:.58rem;font-weight:800;letter-spacing:.08em;padding:3px 9px;border-radius:20px;}',
      '.dxr-chip{font-size:.58rem;font-weight:800;letter-spacing:.08em;padding:3px 9px;border-radius:20px;white-space:nowrap;}',
      '.dxr-num-sep{color:#c3ccd6;font-weight:600;margin:0 5px;}',
      '.dxr-deal{color:#c00;}',
      '.dxr-seg-head{display:flex;align-items:baseline;gap:4px 14px;flex-wrap:wrap;} .dxr-seg-head .dxr-seg-pnr{margin:0;}',
      '.dxr-hdr-row{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;}',
      '.dxr-figs{display:flex;gap:22px;}',
      '.dxr-fig{text-align:right;} .dxr-fig-l{font-size:.56rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9aa7b4;} .dxr-fig-v{font-size:1.45rem;font-weight:800;color:#06203b;line-height:1.1;}',
      '.dxr-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px;}',
      '.dxr-act{background:#06203b;color:#fff;border:none;border-radius:7px;font-size:.68rem;font-weight:700;padding:7px 12px;cursor:pointer;font-family:inherit;}',
      '.dxr-act.ghost{background:#eef2f7;color:#06203b;border:1px solid #d8dee6;}',
      '#dxr-search{margin-top:11px;width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d8dee6;border-radius:8px;font-size:.8rem;font-family:inherit;}',
      '#dxr-body{flex:1;overflow-y:auto;padding:18px 22px 60px;}',
      '.dxr-sc-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;}',
      '.dxr-sc{background:#fff;border:1px solid #e8edf3;border-radius:12px;padding:13px 15px;} .dxr-sc-v{font-size:1.15rem;font-weight:800;color:#06203b;} .dxr-sc-l{font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9aa7b4;margin-top:3px;}',
      '.dxr-card{background:#fff;border:1px solid #e8edf3;border-radius:14px;padding:16px 18px;margin-bottom:14px;}',
      '.dxr-card-t{font-size:.66rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#3a5068;margin-bottom:12px;}',
      '.dxr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:11px;}',
      '.dxr-empty{color:#9aa7b4;font-size:.8rem;padding:8px 0;}',
      '.dxr-trip{display:flex;flex-direction:column;}',
      '.dxr-seg{display:flex;gap:22px;padding-left:6px;}',
      '.dxr-seg-rail{display:flex;flex-direction:column;align-items:center;padding-top:5px;}',
      '.dxr-dot{width:11px;height:11px;border-radius:50%;background:#06203b;flex-shrink:0;}',
      '.dxr-line{flex:1;width:2px;background:#d8dee6;margin:3px 0;min-height:34px;}',
      '.dxr-seg-body{flex:1;padding-bottom:16px;}',
      '.dxr-seg-route{font-size:1.05rem;font-weight:800;color:#06203b;} .dxr-arrow{color:#c00;}',
      '.dxr-seg-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:.72rem;color:#3a5068;margin-top:4px;} .dxr-seg-meta b{color:#06203b;}',
      '.dxr-pax,.dxr-pnr,.dxr-sup,.dxr-ffp{background:#f8fafc;border:1px solid #e8edf3;border-radius:11px;padding:12px 14px;}',
      '.dxr-pax-n{font-weight:800;color:#06203b;margin-bottom:7px;}',
      '.dxr-pax-r{display:flex;justify-content:space-between;font-size:.72rem;color:#7a8a99;padding:2px 0;} .dxr-pax-r b{color:#06203b;}',
      '.dxr-pnr{cursor:pointer;} .dxr-pnr-h{display:flex;justify-content:space-between;align-items:center;} .dxr-pnr-code{font-family:monospace;font-size:.95rem;color:#06203b;} .dxr-pnr-meta{font-size:.68rem;color:#9aa7b4;margin-top:5px;}',
      '.dxr-sup-h,.dxr-ffp-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;} .dxr-sup-n,.dxr-ffp-n{font-weight:800;color:#06203b;}',
      '.dxr-sup-g,.dxr-ffp-g,.dxr-nf-g{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;font-size:.72rem;color:#7a8a99;} .dxr-sup-g b,.dxr-ffp-g b,.dxr-nf-g b{color:#06203b;display:block;}',
      '.dxr-mini{margin-top:10px;background:#eef2f7;border:1px solid #d8dee6;border-radius:7px;font-size:.66rem;font-weight:700;color:#06203b;padding:6px 10px;cursor:pointer;font-family:inherit;}',
      '.dxr-top{font-size:.55rem;font-weight:800;color:#d97706;background:rgba(217,119,6,0.12);padding:2px 7px;border-radius:10px;}',
      '.dxr-fin .dxr-finblk{margin-bottom:14px;} .dxr-finblk-t{font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9aa7b4;margin-bottom:7px;}',
      '.dxr-finrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;}',
      '.dxr-finfig{background:#f8fafc;border:1px solid #e8edf3;border-radius:10px;padding:11px 13px;} .dxr-finfig-l{font-size:.58rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9aa7b4;} .dxr-finfig-v{font-size:1.15rem;font-weight:800;color:#06203b;margin-top:3px;}',
      '.dxr-finfig-s{font-size:.62rem;color:#7a8a99;margin-top:2px;}',
      '.dxr-alogo{height:24px;width:auto;max-width:64px;object-fit:contain;object-position:left center;display:block;}',
      '.dxr-bigrow{display:flex;gap:26px;flex-wrap:wrap;padding:4px 2px 14px;border-bottom:1px solid #eef1f5;margin-bottom:14px;}',
      '.dxr-bigfig .dxr-bigfig-l{font-size:.56rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9aa7b4;} .dxr-bigfig-v{font-size:1.6rem;font-weight:800;color:#06203b;line-height:1.1;margin-top:2px;}',
      '.dxr-nf-edit{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;} .dxr-nf-edit label{font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;} .dxr-nf-edit input{flex:1;min-width:150px;padding:8px 11px;border:1px solid #d8dee6;border-radius:8px;font-size:.85rem;font-family:monospace;} .dxr-nf-edit .dxr-mini{margin-top:0;}',
      '.dxr-note{font-size:.66rem;color:#9aa7b4;margin-top:6px;}',
      '.dxr-snap-wrap{overflow-x:auto;margin:0 -2px;}',
      '.dxr-snap{width:100%;border-collapse:collapse;font-size:.74rem;}',
      '.dxr-snap th{text-align:left;font-size:.55rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;padding:7px 10px;border-bottom:1px solid #e3e9f0;white-space:nowrap;}',
      '.dxr-snap td{padding:8px 10px;border-bottom:1px solid #f0f3f7;color:#21364a;vertical-align:top;}',
      '.dxr-snap .dxr-num-c{text-align:right;white-space:nowrap;}',
      '.dxr-snap th.dxr-num-c{text-align:right;}',
      '.dxr-snap tbody tr:hover{background:#f8fafc;}',
      '.dxr-snap-tr{font-weight:700;color:#06203b;white-space:nowrap;}',
      '.dxr-snap-sub{font-weight:800;color:#41566b;background:#f1f4f8;border-radius:5px;}',
      '.dxr-fe-row td.dxr-snap-sub{position:relative;}',
      '.dxr-fe-row td.dxr-snap-sub::after{content:"auto";position:absolute;top:2px;right:6px;font-size:.5rem;font-weight:700;letter-spacing:.06em;color:#9fb0c0;text-transform:uppercase;}',
      '.dxr-snap tfoot td{border-top:1px solid #e3e9f0;border-bottom:none;}',
      '.dxr-snap-total td{font-weight:800;color:#06203b;background:#f4f7fb;}',
      '.dxr-snap-frow td{padding:5px 10px;color:#41566b;border-bottom:none;}',
      '.dxr-snap-flabel{text-align:right;font-weight:600;}',
      '.dxr-snap-grand td{font-weight:800;color:#06203b;font-size:.82rem;border-top:1px solid #d8dee6;}',
      '.dxr-snap-rav td{color:#06203b;font-weight:800;}',
      '.dxr-snap-cap{font-size:.6rem;color:#9aa7b4;margin-top:8px;}',
      '.dxr-snap input.dxr-fe{width:100%;min-width:60px;box-sizing:border-box;border:1px solid transparent;background:transparent;border-radius:6px;padding:4px 6px;font-family:inherit;font-size:.74rem;color:#21364a;}',
      '.dxr-snap input.dxr-fe:hover{border-color:#e3e9f0;background:#fff;}',
      '.dxr-snap input.dxr-fe:focus{outline:none;border-color:#06203b;background:#fff;}',
      '.dxr-snap input.dxr-fe-num{text-align:right;}',
      '.dxr-snap input.dxr-fe-pnr{font-weight:800;letter-spacing:.04em;color:#06203b;text-transform:uppercase;}',
      '.dxr-snap input.dxr-fe-txt{font-weight:600;}',
      '.dxr-snap td.dxr-fe-del{text-align:center;padding:2px 4px;}',
      '.dxr-fe-del button{border:none;background:transparent;color:#b3bdc8;font-size:.9rem;cursor:pointer;padding:2px 7px;border-radius:6px;line-height:1;} .dxr-fe-del button:hover{background:#fdecec;color:#dc2626;}',
      '.dxr-fe-add{margin-top:10px;}',
      '.dxr-paxc-cat{font-size:.6rem;font-weight:800;letter-spacing:.08em;color:#41566b;background:#eef2f7;border-radius:20px;padding:4px 11px;white-space:nowrap;flex-shrink:0;}',
      '.dxr-snap-pnr{font-weight:800;letter-spacing:.04em;color:#06203b;white-space:nowrap;}',
      '.dxr-cfb{margin-top:14px;border:1px solid #e3e9f0;border-radius:10px;overflow:hidden;}',
      '.dxr-cfb-h{font-size:.56rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9aa7b4;padding:8px 12px;background:#f7f9fc;border-bottom:1px solid #eef2f6;}',
      '.dxr-cfb-grid{display:flex;flex-direction:column;}',
      '.dxr-cfb-main,.dxr-cfb-sub{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:7px 12px;border-bottom:1px solid #f4f6f9;}',
      '.dxr-cfb-grid>div:last-child{border-bottom:none;}',
      '.dxr-cfb-main>span{font-weight:700;color:#06203b;font-size:.78rem;} .dxr-cfb-main>b{font-weight:800;color:#06203b;font-size:.84rem;white-space:nowrap;}',
      '.dxr-cfb-sub{padding-left:28px;} .dxr-cfb-sub>span{color:#7a8a99;font-size:.72rem;} .dxr-cfb-sub>b{color:#41566b;font-weight:700;font-size:.76rem;white-space:nowrap;}',
      '.dxr-rav{margin-top:12px;display:flex;flex-direction:column;gap:2px;}',
      '.dxr-rav-row{display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:6px 12px;}',
      '.dxr-rav-row>span{font-weight:700;color:#06203b;font-size:.78rem;}',
      '.dxr-rav-brut{font-weight:800;color:#06203b;font-size:.86rem;white-space:nowrap;}',
      '.dxr-rav-net{font-weight:800;color:#16a34a;font-size:.86rem;white-space:nowrap;}',
      '.dxr-nf-rav{margin-top:12px;border-top:1px solid #eef2f6;padding-top:10px;}',
      '.dxr-nf-rav-t{font-size:.56rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;margin-bottom:6px;}',
      '.dxr-nf-rav-g{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;} .dxr-nf-rav-g>div{display:flex;flex-direction:column;} .dxr-nf-rav-g span{font-size:.56rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9aa7b4;} .dxr-nf-rav-g b{font-size:.82rem;color:#06203b;font-weight:800;}',
      '.dxr-fig-primary .dxr-fig-v{font-size:1.55rem;font-weight:800;color:#06203b;line-height:1.05;}',
      '.dxr-trav-pax-list{display:flex;flex-direction:column;gap:7px;}',
      '.dxr-trav-pax{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafc;border:1px solid #e8edf3;border-radius:10px;padding:9px 13px;}',
      '.dxr-tp-name{font-weight:800;color:#06203b;font-size:.9rem;cursor:pointer;border-bottom:1px dotted #9aa7b4;display:inline-block;} .dxr-tp-name:hover{color:#1d6fb8;border-bottom-color:#1d6fb8;}',
      '.dxr-tp-tk{font-size:.66rem;color:#7a8a99;margin-top:3px;font-weight:600;letter-spacing:.02em;}',
      '.dxr-tp-r{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;} .dxr-tp-tag{background:#eef2f7;color:#41566b;font-size:.6rem;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap;}',
      '.dxr-fx{margin-left:auto;display:flex;align-items:center;background:#f0f5fb;border-radius:9px;padding:7px 13px;} .dxr-fx-t{font-size:.54rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;} .dxr-fx-v{font-size:.92rem;color:#06203b;font-weight:600;} .dxr-fx-v b{font-weight:800;} .dxr-fx-s{font-size:.56rem;color:#9aa7b4;}',
      '.dxr-std{min-height:210px;}',
      '.dxr-fig-primary{padding-right:18px;border-right:2px solid #e3e9f0;margin-right:6px;}',
      '.dxr-arail{position:relative;display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;}',
      '.dxr-acode{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:800;color:#9aa7b4;background:transparent;}',
      '.dxr-vgroup{padding-top:2px;}',
      '.dxr-vgroup + .dxr-vgroup{margin-top:18px;border-top:1px dashed #e3e9f0;padding-top:14px;}',
      '.dxr-vgroup-pax{margin-top:12px;}',
      '.dxr-seg-air{font-weight:800;color:#06203b;}',
      '.dxr-seg-dur{margin-left:auto;font-size:.72rem;font-weight:700;color:#41566b;background:#eef2f7;border-radius:20px;padding:3px 11px;white-space:nowrap;}',
      '.dxr-iti{display:flex;align-items:center;padding:8px 0;}',
      '.dxr-iti-logo{flex-shrink:0;width:52px;margin-left:4px;margin-right:22px;display:flex;align-items:center;justify-content:center;}',
      '.dxr-iti-pax{margin-top:10px;}',
      '.dxr-iti-body{flex:1;min-width:0;}',
      '.dxr-iti-head{display:flex;align-items:center;flex-wrap:wrap;gap:10px;}',
      '.dxr-iti-route{font-weight:800;color:#06203b;font-size:1.05rem;letter-spacing:.01em;}',
      '.dxr-iti-meta-air{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;}',
      '.dxr-iti-legs{margin-top:7px;padding-left:14px;display:flex;flex-direction:column;gap:4px;border-left:2px solid #eef2f7;}',
      '.dxr-iti-leg{display:flex;align-items:baseline;flex-wrap:wrap;gap:9px;font-size:.78rem;color:#41566b;}',
      '.dxr-iti-fn{font-weight:800;color:#06203b;font-family:ui-monospace,Menlo,monospace;min-width:56px;}',
      '.dxr-iti-pt{color:#21364a;font-variant-numeric:tabular-nums;}',
      '.dxr-iti-dur{color:#8a99a8;font-size:.72rem;}',
      '.dxr-iti-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 26px;align-items:start;}',
      '@media(max-width:720px){.dxr-iti-cols{grid-template-columns:1fr;}}',
      '.dxr-iti-col{min-width:0;}',
      '.dxr-iti-coltag{font-size:.6rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8a99a8;margin-bottom:2px;}',
      '.dxr-head-save{background:#06203b;color:#fff;border-color:#06203b;margin-right:6px;}',
      '.dxr-snap select.dxr-fe-sel{width:100%;min-width:90px;box-sizing:border-box;border:1px solid transparent;background:transparent;border-radius:6px;padding:4px 4px;font-family:inherit;font-size:.74rem;font-weight:600;color:#21364a;cursor:pointer;} .dxr-snap select.dxr-fe-sel:hover{border-color:#e3e9f0;background:#fff;} .dxr-snap select.dxr-fe-sel:focus{outline:none;border-color:#06203b;background:#fff;}',
      '.dxr-arail .dxr-alogo{position:relative;width:48px;height:48px;object-fit:contain;background:#fff;border-radius:9px;border:1px solid #e8edf3;padding:3px;}',
      '.dxr-seg-pnr{display:flex;align-items:center;gap:7px;font-size:.78rem;color:#21364a;margin:2px 0 4px;} .dxr-pnr-code2{font-weight:800;letter-spacing:.06em;color:#06203b;}',
      '.dxr-task-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;} @media(max-width:720px){.dxr-task-grid{grid-template-columns:1fr;}}',
      '.dxr-task{cursor:pointer;flex-direction:row;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;} .dxr-task:hover{border-color:#06203b;box-shadow:0 2px 8px rgba(6,32,59,.08);} .dxr-task .dxr-task-main{min-width:0;} .dxr-task .dxr-task-t{white-space:normal;} .dxr-task .dxr-task-badge{align-self:center;flex-shrink:0;}',
      '.dxr-nf-narrow{max-width:25%;min-width:240px;} @media(max-width:720px){.dxr-nf-narrow{max-width:100%;}}',
      '.dxr-costrow{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;} .dxr-cost-c{flex:1;min-width:88px;background:#f8fafc;border:1px solid #e8edf3;border-radius:8px;padding:8px 10px;} .dxr-cost-c span{display:block;font-size:.54rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9aa7b4;} .dxr-cost-c b{font-size:.9rem;color:#06203b;}',
      '.dxr-cost-grand{margin-left:auto;background:#06203b;color:#fff;border-radius:8px;padding:8px 14px;min-width:120px;display:flex;flex-direction:column;justify-content:center;} .dxr-cost-grand span{font-size:.54rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.78;} .dxr-cost-grand b{font-size:1.05rem;}',
      '.dxr-fin .dxr-finfig{padding:6px 8px;} .dxr-fin .dxr-finfig-v{font-size:.92rem;}',
      '.dxr-hist-row{display:flex;gap:16px;align-items:stretch;margin-bottom:16px;}',
      '.dxr-nf-wrap{flex:0 0 33%;display:flex;} .dxr-nf-wrap>.dxr-card{margin:0;flex:1;}',
      '.dxr-memo-card{flex:1;margin:0 4px 0 0;display:flex;flex-direction:column;} .dxr-memo-card .dxr-memo-wrap{flex:1;display:flex;flex-direction:column;} .dxr-memo-card .dxr-memo{flex:1;min-height:60px;max-height:none;}',
      '.dxr-hist-full{margin:0;}',
      '.dxr-nf-col{margin:0;}',
      '@media(max-width:760px){.dxr-hist-row{flex-direction:column;}.dxr-nf-wrap,.dxr-memo-card{flex:1 1 auto;width:100%;}}',
      '.dxr-pax-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:8px;}',
      '.dxr-paxc-meta{font-size:.6rem;color:#41566b;font-weight:700;letter-spacing:.02em;text-align:right;white-space:nowrap;flex-shrink:0;}',
      '.dxr-paxc{background:#f8fafc;border:1px solid #e8edf3;border-radius:10px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;} .dxr-paxc-l{min-width:0;}',
      '.dxr-paxc-name{font-weight:800;color:#06203b;font-size:.84rem;cursor:pointer;border-bottom:1px dotted #9aa7b4;display:inline-block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;} .dxr-paxc-name:hover{color:#1d6fb8;border-bottom-color:#1d6fb8;}',
      '.dxr-paxc-tk{font-size:.64rem;color:#7a8a99;margin-top:3px;font-weight:600;letter-spacing:.02em;}',
      '.dxr-memo-card .dxr-memo{min-height:240px;max-height:480px;}',
      '.dxr-pax-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;}',
      '.dxr-pp-btn{border:1px solid #cfd8e3;background:#fff;color:#06203b;font-size:.6rem;font-weight:700;padding:4px 9px;border-radius:20px;cursor:pointer;white-space:nowrap;} .dxr-pp-btn:hover{background:#06203b;color:#fff;}',
      '.dxr-cli-link{color:#06203b;font-weight:800;cursor:pointer;border-bottom:1px dotted #9aa7b4;} .dxr-cli-link:hover{color:#1d6fb8;border-bottom-color:#1d6fb8;}',
      '.dxr-hist-grid{display:grid;grid-template-columns:60% 40%;gap:16px;} @media(max-width:760px){.dxr-hist-grid{grid-template-columns:1fr;}}',
      '.dxr-sub-t{font-size:.6rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9aa7b4;margin-bottom:8px;}',
      '.dxr-memo-wrap{border:1px solid #e3e9f0;border-radius:10px;overflow:hidden;background:#fff;}',
      '.dxr-memo-tb{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#f4f7fb;border-bottom:1px solid #e3e9f0;} .dxr-memo-tb button{border:1px solid #d4dce6;background:#fff;border-radius:6px;font-size:.66rem;padding:3px 8px;cursor:pointer;color:#06203b;} .dxr-memo-tb button:hover{background:#06203b;color:#fff;}',
      '.dxr-memo-status{margin-left:auto;font-size:.58rem;color:#9aa7b4;font-weight:600;}',
      '.dxr-memo{min-height:150px;max-height:340px;overflow:auto;padding:11px 13px;font-size:.82rem;line-height:1.5;color:#21364a;outline:none;} .dxr-memo:empty:before{content:attr(data-ph);color:#b7c2cf;} .dxr-memo ul{margin:4px 0 4px 18px;}',
      '#dxr-modal{position:fixed;inset:0;z-index:9500;display:none;align-items:flex-start;justify-content:center;background:rgba(6,32,59,0.5);backdrop-filter:blur(2px);overflow-y:auto;padding:5vh 1rem;}',
      '.dxr-modal-box{background:#fff;border-radius:14px;width:100%;max-width:560px;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden;}',
      '.dxr-modal-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef2f6;background:#f7f9fc;} .dxr-modal-t{font-size:.82rem;font-weight:800;letter-spacing:.04em;color:#06203b;text-transform:uppercase;}',
      '.dxr-modal-x{border:none;background:transparent;font-size:1.5rem;line-height:1;color:#9aa7b4;cursor:pointer;}',
      '.dxr-modal-b{padding:16px 18px;}',
      '.dxr-pp-note{font-size:.62rem;color:#7a8a99;margin-bottom:12px;font-style:italic;}',
      '.dxr-pp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;} @media(max-width:480px){.dxr-pp-grid{grid-template-columns:1fr;}}',
      '.dxr-pp-r{display:flex;flex-direction:column;border-bottom:1px solid #f0f3f7;padding:5px 0;} .dxr-pp-r span{font-size:.56rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;} .dxr-pp-r b{font-size:.84rem;color:#06203b;}',
      '.dxr-pp-file{margin-top:14px;padding-top:12px;border-top:1px solid #eef2f6;} .dxr-pp-fn{font-size:.74rem;font-weight:600;color:#06203b;margin-bottom:8px;}',
      '.dxr-pp-acts{display:flex;gap:8px;flex-wrap:wrap;} .dxr-pp-acts a.dxr-mini{text-decoration:none;display:inline-flex;align-items:center;}',
      '.dxr-pp-img{max-width:100%;border-radius:8px;margin-top:12px;border:1px solid #e3e9f0;} .dxr-pp-frame{width:100%;height:420px;border:1px solid #e3e9f0;border-radius:8px;margin-top:12px;}',
      '.dxr-ffp-exec{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin-bottom:12px;padding:11px;background:#f0f5fb;border-radius:10px;}',
      '.dxr-ffp-ex span{display:block;font-size:.56rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9aa7b4;} .dxr-ffp-ex b{font-size:.95rem;color:#06203b;}',
      '.dxr-task-kpi{display:flex;gap:14px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}',
      '.dxr-tk-total{background:#06203b;color:#fff;border-radius:12px;padding:10px 18px;text-align:center;min-width:74px;} .dxr-tk-n{font-size:1.6rem;font-weight:800;line-height:1;} .dxr-tk-l{font-size:.54rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.8;margin-top:2px;}',
      '.dxr-tk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:1;min-width:200px;} .dxr-tk-grid>div{background:#f8fafc;border:1px solid #e8edf3;border-radius:9px;padding:8px 6px;text-align:center;} .dxr-tk-grid b{display:block;font-size:1.15rem;font-weight:800;} .dxr-tk-grid span{font-size:.54rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9aa7b4;}',
      '.dxr-task-list{display:flex;flex-direction:column;gap:7px;}',
      '.dxr-task{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f8fafc;border:1px solid #e8edf3;border-radius:10px;padding:9px 12px;} .dxr-task.done{opacity:.62;} .dxr-task.done .dxr-task-t{text-decoration:line-through;}',
      '.dxr-task-t{font-weight:700;color:#06203b;font-size:.82rem;} .dxr-task-m{display:flex;gap:11px;flex-wrap:wrap;font-size:.64rem;color:#7a8a99;margin-top:3px;}',
      '.dxr-task-badge{color:#fff;font-size:.56rem;font-weight:800;letter-spacing:.05em;padding:3px 9px;border-radius:20px;white-space:nowrap;}',
      '.dxr-task-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:11px;background:#f0f5fb;border-radius:10px;} .dxr-task-form input,.dxr-task-form select{padding:7px 10px;border:1px solid #d8dee6;border-radius:7px;font-size:.78rem;font-family:inherit;} .dxr-task-form #dxr-nt-title{flex:1;min-width:160px;} .dxr-task-form .dxr-mini{margin-top:0;}',
      '.dxr-tl{display:flex;flex-direction:column;gap:2px;} .dxr-tl-i{display:flex;align-items:center;gap:11px;padding:5px 0;} .dxr-tl-d{font-size:.64rem;font-weight:700;color:#9aa7b4;width:54px;flex-shrink:0;} .dxr-tl-dot{width:9px;height:9px;border-radius:50%;background:#0ea5e9;flex-shrink:0;} .dxr-tl-l{font-size:.78rem;color:#06203b;}'
    ].join('');
    document.head.appendChild(st);
    var ov=document.createElement('div'); ov.id='dxr-overlay';
    ov.innerHTML='<div id="dxr-panel"><div id="dxr-head"></div><div id="dxr-body"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) window.closeDossierDrawer(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ var o=document.getElementById('dxr-overlay'); if(o&&o.classList.contains('open')) window.closeDossierDrawer(); } });
  }

  var _cur=null;
  window.openDossierDrawer = function(ref){
    _ensureShell();
    try{ _dxrSyncSuppliers(ref); }catch(e){}
    _cur=_gather(ref);
    var g=_cur;
    var head=document.getElementById('dxr-head'), body=document.getElementById('dxr-body');
    head.innerHTML =
      '<div class="dxr-head-bar"><div style="flex:1;">'+_hdr(g)+'</div>'
      + '<button class="dxr-act dxr-head-save" onclick="window._dxrSaveAll()" title="Enregistrer et propager les modifications">💾 Save</button>'
      + '<button class="dxr-close" onclick="window.closeDossierDrawer()" title="Fermer">✕</button></div>'
      + '<div class="dxr-actions">'
      +   '<button class="dxr-act" onclick="window._dxrAct(\'edit\')">✎ Éditer</button>'
      +   '<button class="dxr-act ghost" onclick="window._dxrEmail()">✉ Email confirmation</button>'
      +   '<button class="dxr-act ghost" onclick="window.print()">⤓ PDF</button>'
      +   '<button class="dxr-act ghost" onclick="window._dxrInvoice()" title="Copier le lien facture + ouvrir">🧾 Invoice</button>'
      + '</div>'
      + '<input id="dxr-search" placeholder="🔍 Filtrer : PNR, billet, passager, fournisseur, NF…" oninput="window._dxrFilter(this.value)">';
    body.innerHTML =
        _travel(g) + _fin(g) + _taskSec(g) + _history(g);
    body.scrollTop=0;
    document.getElementById('dxr-overlay').classList.add('open');
  };
  window.closeDossierDrawer = function(){ var o=document.getElementById('dxr-overlay'); if(o) o.classList.remove('open'); };

  window._dxrFilter = function(q){
    q=(q||'').toLowerCase().trim();
    document.querySelectorAll('#dxr-body .dxr-filterable').forEach(function(el){
      var hay=(el.getAttribute('data-s')||el.textContent||'').toLowerCase();
      el.style.display = (!q||hay.indexOf(q)>=0)?'':'none';
    });
  };
  window._dxrOpenSupplier = function(name){
    if (!_cur) return;
    var n=name||(_cur.suppliers[0]&&_cur.suppliers[0].name);
    if (!n){ if(typeof toast==='function') toast('Aucun fournisseur lié','error'); return; }
    window.closeDossierDrawer();
    try { if (typeof window.sidebarGo==='function') window.sidebarGo('fornecedores'); } catch(e){}
    setTimeout(function(){ try{ if(typeof window.openFornDetails330==='function') window.openFornDetails330(n); }catch(e){} }, 120);
  };
  /* ── Operational memo (stored inside the dossier record — single source) ── */
  var _dxrMemoT=null;
  window._dxrMemoCmd=function(cmd){ try{ document.execCommand(cmd,false,null); }catch(e){} var el=document.getElementById('dxr-memo'); if(el) el.focus(); window._dxrMemoDirty(); };
  window._dxrMemoDirty=function(){ if(_dxrMemoT) clearTimeout(_dxrMemoT); var st=document.getElementById('dxr-memo-status'); if(st) st.textContent='Enregistrement\u2026'; _dxrMemoT=setTimeout(window._dxrMemoSave,800); };
  window._dxrMemoSave=function(){
    if(!_cur) return; var el=document.getElementById('dxr-memo'); if(!el) return;
    var id=_cur.id, key='expatur_dossier_'+id, d=null;
    try{ d=JSON.parse(localStorage.getItem(key)||'null'); }catch(e){}
    if(!d||typeof d!=='object') return;
    var who=_meUser()||((_cur.owner&&_cur.owner!=='\u2014')?_cur.owner:'')||'Agent';
    d.memo={ html:el.innerHTML, updatedAt:new Date().toISOString(), editor:who };
    try{ localStorage.setItem(key,JSON.stringify(d)); }catch(e){}
    _cur.memo=d.memo;
    var st=document.getElementById('dxr-memo-status'); if(st) st.textContent='Modifi\u00e9 '+_fmtD(d.memo.updatedAt)+' \u00b7 '+who;
  };

  /* ── Generic modal (sits above the drawer) ── */
  function _dxrModal(title, bodyHtml){
    var ov=document.getElementById('dxr-modal'); 
    if(!ov){ ov=document.createElement('div'); ov.id='dxr-modal'; document.body.appendChild(ov);
      ov.onclick=function(e){ if(e.target===ov) ov.style.display='none'; }; }
    ov.innerHTML='<div class="dxr-modal-box"><div class="dxr-modal-h"><div class="dxr-modal-t">'+title+'</div>'
      +'<button class="dxr-modal-x" onclick="document.getElementById(\'dxr-modal\').style.display=\'none\'">\u00d7</button></div>'
      +'<div class="dxr-modal-b">'+bodyHtml+'</div></div>';
    ov.style.display='flex';
    return ov;
  }

  /* ── Travel Document popup (reads existing client + passport-file stores) ── */
  window._dxrPassport=function(idx){
    if(!_cur) return; var ref=_cur.ref;
    var cli=null,file=null;
    try{ cli=JSON.parse(localStorage.getItem('expatur_client_'+ref)||'null'); }catch(e){}
    try{ file=JSON.parse(localStorage.getItem('expatur_cli_passport_'+ref)||'null'); }catch(e){}
    cli=cli||{}; var p=(_cur.pax&&_cur.pax[idx])||{};
    var num=cli.passport||'', nat=cli.nationalite||'', dob=p.dob||cli.naissance||'', exp=cli.passport_exp||'',
        gender=cli.civilite||'', country=cli.pays||cli.nationalite||'', name=p.name||((cli.prenom||'')+' '+(cli.nom||'')).trim();
    function row(l,v){ return '<div class="dxr-pp-r"><span>'+l+'</span><b>'+(v?_esc(v):'\u2014')+'</b></div>'; }
    var grid='<div class="dxr-pp-grid">'
      + row('N\u00b0 passeport',num) + row('Nationalit\u00e9',nat) + row('Date de naissance',dob?_fmtD(dob):'')
      + row("Date d'\u00e9mission",'') + row("Date d'expiration",exp?_fmtD(exp):'') + row('Sexe',gender)
      + row('Pays \u00e9metteur',country) + row('Type de document','Passeport') + '</div>';
    var fileBlock;
    if (file&&file.dataUrl){
      var isPdf=/pdf/i.test(file.type||'')||/\.pdf$/i.test(file.name||'');
      window._dxrPpFile=file;
      fileBlock='<div class="dxr-pp-file"><div class="dxr-pp-fn">\ud83d\udcce '+_esc(file.name||'passeport')+'</div>'
        + '<div class="dxr-pp-acts">'
        +   '<button class="dxr-mini" onclick="window._dxrPpCopy()">Copier les donn\u00e9es</button>'
        +   '<a class="dxr-mini" href="'+file.dataUrl+'" download="'+_esc(file.name||'passeport')+'">T\u00e9l\u00e9charger</a>'
        +   '<button class="dxr-mini" onclick="window._dxrPpView()">Voir</button>'
        + '</div><div id="dxr-pp-view"></div></div>';
    } else {
      fileBlock='<div class="dxr-pp-file"><div class="dxr-empty">Aucun fichier passeport li\u00e9 dans Ticketing pour ce dossier.</div>'
        + '<div class="dxr-pp-acts"><button class="dxr-mini" onclick="window._dxrPpCopy()">Copier les donn\u00e9es</button></div></div>';
    }
    window._dxrPpData={num:num,nat:nat,dob:dob,exp:exp,gender:gender,country:country,name:name};
    _dxrModal('Travel Doc \u2014 '+_esc(name||'Passager'),
      '<div class="dxr-pp-note">Source : Ticketing \u00b7 Passenger Documents (lien CloudFlare \u2014 lecture seule).</div>'+grid+fileBlock);
  };
  window._dxrPpCopy=function(){ var d=window._dxrPpData||{}; var t='Passeport: '+(d.num||'-')+'\nNom: '+(d.name||'-')+'\nNationalit\u00e9: '+(d.nat||'-')+'\nNaissance: '+(d.dob||'-')+'\nExpiration: '+(d.exp||'-')+'\nSexe: '+(d.gender||'-')+'\nPays: '+(d.country||'-'); try{ navigator.clipboard.writeText(t); if(window.toast) toast('Donn\u00e9es copi\u00e9es','success'); }catch(e){} };
  window._dxrPpView=function(){ var f=window._dxrPpFile, el=document.getElementById('dxr-pp-view'); if(!f||!el) return; var isPdf=/pdf/i.test(f.type||'')||/\.pdf$/i.test(f.name||''); el.innerHTML = isPdf ? '<iframe class="dxr-pp-frame" src="'+f.dataUrl+'"></iframe>' : '<img class="dxr-pp-img" src="'+f.dataUrl+'" alt="passeport">'; };

  /* ── Client detail popup (existing client entity + aggregation) ── */
  window._dxrClient=function(){
    if(!_cur) return; var ref=_cur.ref;
    var cli=null; try{ cli=JSON.parse(localStorage.getItem('expatur_client_'+ref)||'null'); }catch(e){}
    cli=cli||{};
    var db=[]; try{ db=JSON.parse(localStorage.getItem('expatur_clients_db')||'[]'); }catch(e){} if(!Array.isArray(db)) db=[];
    var email=(cli.email||'').toLowerCase(), nameU=((cli.prenom||'')+' '+(cli.nom||'')).trim().toUpperCase();
    var dbRec=null;
    if(email) dbRec=db.find(function(c){ return c.email&&c.email.toLowerCase()===email; });
    if(!dbRec&&nameU) dbRec=db.find(function(c){ return (((c.prenom||'')+' '+(c.nom||'')).trim().toUpperCase())===nameU; });
    var since=(dbRec&&dbRec.createdAt)?_fmtD(dbRec.createdAt):(cli.updatedAt?_fmtD(cli.updatedAt):'');
    var list=[]; try{ list=JSON.parse(localStorage.getItem('expatur_dossier_list')||'[]'); }catch(e){} if(!Array.isArray(list)) list=[];
    var deals=0, revenue=0, lastB='', lastBt=0;
    list.forEach(function(it){
      var dd=null; try{ dd=JSON.parse(localStorage.getItem('expatur_dossier_'+it.id)||'null'); }catch(e){}
      if(!dd) return; var ff=dd.fields||{}; var ref2=ff['booking-ref']||'';
      var c2=null; try{ c2=JSON.parse(localStorage.getItem('expatur_client_'+ref2)||'null'); }catch(e){}
      var match=false;
      if(email&&c2&&(c2.email||'').toLowerCase()===email) match=true;
      else if(nameU&&(((ff['pax-name-1']||'').trim().toUpperCase())===nameU)) match=true;
      if(match){ deals++;
        var pnl=null; try{ pnl=JSON.parse(localStorage.getItem('expatur_pnl_'+ref2)||'null'); }catch(e){}
        if(pnl&&pnl.netSell!=null) revenue+=_num(pnl.netSell);
        var ba=null; try{ ba=localStorage.getItem('expatur_bookedAt_'+ref2); }catch(e){}
        var t=_dt(ba); if(t&&t.getTime()>lastBt){ lastBt=t.getTime(); lastB=ref2; }
      }
    });
    var openT=_cur.taskCounts?(_cur.taskCounts.open+_cur.taskCounts.waiting+_cur.taskCounts.inprogress):0;
    var name=((cli.prenom||'')+' '+(cli.nom||'')).trim()||(_cur.pax[0]&&_cur.pax[0].name)||'\u2014';
    function r(l,v){ return '<div class="dxr-pp-r"><span>'+l+'</span><b>'+(v?_esc(String(v)):'\u2014')+'</b></div>'; }
    var grid='<div class="dxr-pp-grid">'
      + r('Email',cli.email) + r('T\u00e9l\u00e9phone',cli.tel||cli.whatsapp) + r('Pays',cli.pays)
      + r('Ville',cli.ville) + r('Client depuis',since) + r('Dossiers',deals||1)
      + r('Revenu total (R$)',revenue?revenue.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'\u2014')
      + r('T\u00e2ches ouvertes',openT) + r('Dernier dossier',lastB||ref) + '</div>';
    var mail=cli.email||'';
    var acts='<div class="dxr-pp-acts" style="margin-top:14px;">'
      + '<button class="dxr-mini" onclick="document.getElementById(\'dxr-modal\').style.display=\'none\';if(typeof sidebarGo===\'function\')sidebarGo(\'clientes\')">Ouvrir la fiche client</button>'
      + '<button class="dxr-mini" onclick="document.getElementById(\'dxr-modal\').style.display=\'none\';var f=document.getElementById(\'dxr-newtask\');if(f){f.style.display=\'flex\';f.scrollIntoView({behavior:\'smooth\'});}">Cr\u00e9er une t\u00e2che</button>'
      + '<button class="dxr-mini" onclick="document.getElementById(\'dxr-modal\').style.display=\'none\';if(typeof sidebarGo===\'function\')sidebarGo(\'quoting\')">Nouvelle r\u00e9servation</button>'
      + (mail?'<a class="dxr-mini" href="mailto:'+_esc(mail)+'">Envoyer un email</a>':'')
      + '</div>';
    _dxrModal('Client \u2014 '+_esc(name), grid+acts);
  };

  window._dxrOpenTask = function(id){
    if(!_cur) return;
    try{ var ri=document.getElementById('booking-ref'); if(ri) ri.value=_cur.ref; }catch(e){}
    try{ if(typeof _loadTasks==='function') _loadTasks(); }catch(e){}
    try{ if(typeof openTaskDetail==='function'){ openTaskDetail(id); try{ var _tm=document.getElementById('task-detail-modal'); if(_tm){ if(_tm.parentNode!==document.body) document.body.appendChild(_tm); _tm.style.position='fixed'; _tm.style.zIndex='2147483000'; _tm.style.display='flex'; } }catch(e2){} return; } }catch(e){}
    try{ if(typeof switchDossier==='function'){ closeDossierDrawer(); switchDossier(_cur.id); if(typeof sidebarGo==='function') sidebarGo('tarefas'); } }catch(e){}
  };
  window._dxrSaveTask = function(){
    if (!_cur) return;
    var ti=(document.getElementById('dxr-nt-title')||{}).value||''; ti=ti.trim();
    if (!ti){ if(window.toast) toast('Intitulé requis','error'); return; }
    var cat=(document.getElementById('dxr-nt-cat')||{}).value||'Diversos';
    var due=(document.getElementById('dxr-nt-due')||{}).value||'';
    var ref=_cur.ref, key='tasks_v2_'+ref, tks=[]; try{ tks=JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){} if(!Array.isArray(tks)) tks=[];
    var pnrs=(_cur.pnrs||[]).map(function(p){return (p.airline?p.airline+'/':'')+p.pnr;}).join(', ');
    var sups=(_cur.suppliers||[]).map(function(s){return s.name;}).join(', ');
    var client=(_cur.f['pax-name-1']||(_cur.pax[0]&&_cur.pax[0].name)||'');
    var ctx='Dossier '+ref+(client?' · '+client:'')+(pnrs?' · PNR '+pnrs:'')+(sups?' · Fourn. '+sups:'')+(_cur.nf&&_cur.nf.number?' · NF '+_cur.nf.number:'');
    var t={ id:'tk-'+Date.now(), title:ti, text:ti, cat:cat, category:cat, dueDate:due, prio:'normal', done:false, status:'open',
      ref:ref, dossierId:_cur.id, client:client, pax:(_cur.pax||[]).map(function(p){return p.name;}), pnrs:pnrs, suppliers:sups,
      nfNumber:(_cur.nf&&_cur.nf.number)||'', comment:ctx, createdAt:new Date().toISOString() };
    tks.push(t); try{ localStorage.setItem(key, JSON.stringify(tks)); }catch(e){}
    try{ if(typeof window.renderTasks==='function') window.renderTasks(); }catch(e){}
    if (window.toast) toast('Tâche créée','success');
    window.openDossierDrawer(ref);
  };
  window._dxrEmail = function(){
    if (!_cur) return; var id=_cur.id;
    /* same behaviour as the ticketing COMMS button: load the dossier, then open
       the confirmation-email popup (openCommsPopup auto-fills from the dossier). */
    window.closeDossierDrawer();
    try { if (id && typeof window.switchDossier==='function') window.switchDossier(id); } catch(e){}
    try { if (typeof window.sidebarGo==='function') window.sidebarGo('index'); } catch(e){}
    setTimeout(function(){ try { if (typeof window.openCommsPopup==='function') window.openCommsPopup(); else if (typeof window.toast==='function') toast('COMMS indisponible','error'); } catch(e){} }, 400);
  };
  window._dxrSaveNF = function(val){
    if (!_cur) return; val=(val||'').trim(); var ref=_cur.ref, key='tasks_v2_'+ref, tks=[];
    try { tks=JSON.parse(localStorage.getItem(key)||'[]'); } catch(e){} if(!Array.isArray(tks)) tks=[];
    var nfTask=null; for (var i=tks.length-1;i>=0;i--){ if(tks[i]&&(tks[i].cat==='Notas Fiscais'||tks[i].category==='Notas Fiscais')){ nfTask=tks[i]; break; } }
    if (!nfTask){ nfTask={ id:'nf-'+Date.now(), title:'Emitir N.F', text:'Emitir N.F', cat:'Notas Fiscais', category:'Notas Fiscais', done:false, ref:ref }; tks.push(nfTask); }
    nfTask.nfNumber=val; nfTask.updatedAt=new Date().toISOString();
    if (val){ nfTask.done=true; nfTask.status='completed'; nfTask.doneAt=new Date().toISOString(); }
    try { localStorage.setItem(key, JSON.stringify(tks)); } catch(e){}
    try { if (window._taskFilesPush){} } catch(e){}
    try { if (typeof window.renderTasks==='function') window.renderTasks(); } catch(e){}
    if (typeof window.toast==='function') window.toast('N° NF enregistré'+(val?' : '+val:''),'success');
    window.openDossierDrawer(ref);
  };
  window._dxrOpenNF = function(){
    window.closeDossierDrawer();
    try { if (typeof window.sidebarGo==='function') window.sidebarGo('financeiro'); } catch(e){}
  };
  window._dxrAct = function(kind){
    if (!_cur) return; var id=_cur.id, ref=_cur.ref;
    if (kind==='copy'){ _copy(_cur); return; }
    window.closeDossierDrawer();
    if ((kind==='edit'||kind==='booking'||kind==='issue')){
      try { if (id&&typeof window.switchDossier==='function') window.switchDossier(id); }catch(e){}
      try { if (typeof window.sidebarGo==='function') window.sidebarGo('index'); }catch(e){}
      if (kind==='issue') setTimeout(function(){ try{ if(typeof window.openBilletModal==='function') window.openBilletModal(); }catch(e){} }, 250);
    }
  };
  function _copy(g){
    var lines=['DOSSIER '+g.ref, (g.pax[0]&&g.pax[0].name)||'', 'Type: '+g.type+' · Pax: '+g.pax.length+' · '+g.dealStr,
      'PNRs: '+g.pnrs.map(function(p){return (p.airline?p.airline+'/':'')+p.pnr;}).join(', '),
      'Itinéraire: '+g.legs.map(function(l){return (l.dep||'?')+'→'+(l.arr||'?');}).join(' · '),
      'Repasse: '+_brl(g.repasse)+(g.marginBRL!=null?(' · Marge: '+_brl(g.marginBRL)+' ('+(g.marginPct!=null?g.marginPct.toFixed(1)+'%':'—')+')'):''),
      'Statut: '+[g.booked?'BOOKED':'',g.issued?'ISSUED':'',g.paid?'PAID':'',g.nf?'NF':''].filter(Boolean).join(' ')];
    var txt=lines.filter(Boolean).join('\n');
    if (navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(function(){ if(typeof toast==='function') toast('Résumé copié','success'); }).catch(function(){}); }
  }
})();
