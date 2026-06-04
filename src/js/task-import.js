/**
 * task-import.js — Importação de tarefas a partir de ficheiros Excel/HTML
 *
 * Substitui a função importTasksFromExcel do app.js que falha com
 * ficheiros XLS gerados como HTML (ex: exportações do Bitrix24).
 *
 * Suporta:
 *  - XLS/XLSX reais (via XLSX library)
 *  - XLS-HTML (ficheiros .xls que são tabelas HTML — exportações Bitrix24)
 *
 * Mapeamento de colunas do ficheiro tasks.xls (Bitrix24):
 *  Task        → text (título da tarefa)
 *  Description → comment
 *  Project     → cat (categoria — ver mapa PROJECT_TO_CAT)
 *  Status      → done (Completed = true)
 *  Deadline    → dueDate
 *  Assignee    → assignee (info extra guardada no comment)
 */

// ── Mapeamento Project (Bitrix24) → Categoria (app) ──────────────────────────
const PROJECT_TO_CAT = {
  'CHECKIN':            'Check-in',
  'CHECK-IN':           'Check-in',
  'PAGAMENTO PENDENTE': 'Payments',
  'PAYMENTS':           'Payments',
  'SURINAME VISA':      'Suriname Visa',
  'ICF & VISAS':        'Suriname Visa',
  'ICF &amp; VISAS':    'Suriname Visa',
  'SURINAME I.C.F':     'Suriname I.C.F',
  'QR CODE REP DOM':    'QR code R.D',
  'QR CODE':            'QR code R.D',
  'VOLTA CANCELADA':    'Volta Cancelada',
  'NFS':                'Notas Fiscais',
  'NOTAS FISCAIS':      'Notas Fiscais',
  'FACTURE':            'Facture',
  'DIVERSOS':           'Diversos',
  'DIVERS':             'Diversos',
};

const VALID_CATS = ['Check-in','Payments','Suriname Visa','Suriname I.C.F',
                    'QR code R.D','Volta Cancelada','Notas Fiscais','Facture','Diversos'];

// ── Parse HTML-table XLS (formato Bitrix24) ───────────────────────────────────
function _parseHtmlXls(text) {
  const rows = [];
  let headers = [];

  // Extrair cabeçalhos <th>
  const thMatch = text.match(/<thead[\s\S]*?<\/thead>/i);
  if (thMatch) {
    const ths = thMatch[0].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    headers = ths.map(function(th) {
      return th.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').trim();
    });
  }

  if (!headers.length) return null;

  // Extrair linhas <tr> do <tbody>
  const tbodyMatch = text.match(/<tbody[\s\S]*?<\/tbody>/i);
  const trSource = tbodyMatch ? tbodyMatch[0] : text;
  const trs = trSource.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  trs.forEach(function(tr) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (!tds.length) return;
    const row = {};
    tds.forEach(function(td, i) {
      if (i < headers.length) {
        const val = td.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').trim();
        row[headers[i]] = val;
      }
    });
    if (Object.values(row).some(function(v){ return v; })) {
      rows.push(row);
    }
  });

  return rows;
}

// ── Parse XLS/XLSX real (via XLSX library) ────────────────────────────────────
function _parseXlsx(arrayBuffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Biblioteca XLSX não carregada — aguarde alguns segundos e tente novamente.');
  }
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// ── Detectar se é HTML ────────────────────────────────────────────────────────
function _isHtml(arrayBuffer) {
  const head = new TextDecoder().decode(new Uint8Array(arrayBuffer, 0, 200));
  return /<html|<meta|<table|<thead/i.test(head);
}

// ── Obter valor de uma linha com múltiplos aliases ────────────────────────────
function _col(row, aliases) {
  const keys = Object.keys(row);
  for (let i = 0; i < aliases.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (keys[j].trim().toLowerCase() === aliases[i].toLowerCase()) {
        return (row[keys[j]] + '').trim();
      }
    }
  }
  return '';
}

// ── Mapear categoria ──────────────────────────────────────────────────────────
function _mapCat(raw) {
  if (!raw) return 'Diversos';
  const upper = raw.toUpperCase().trim();
  if (PROJECT_TO_CAT[upper]) return PROJECT_TO_CAT[upper];
  if (PROJECT_TO_CAT[raw.trim()]) return PROJECT_TO_CAT[raw.trim()];
  // Fuzzy match
  for (const key of Object.keys(PROJECT_TO_CAT)) {
    if (upper.includes(key) || key.includes(upper)) return PROJECT_TO_CAT[key];
  }
  // Ver se o valor já é uma categoria válida
  if (VALID_CATS.indexOf(raw.trim()) >= 0) return raw.trim();
  return 'Diversos';
}

// ── Converter data ────────────────────────────────────────────────────────────
function _parseDate(raw) {
  if (!raw) return '';
  // Excel serial number
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 40000 && num < 100000) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + num * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 16);
  }
  // ISO / standard date string
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 16);
  return '';
}

// ── Implementação principal ───────────────────────────────────────────────────
function _doImport(rows) {
  if (!rows || !rows.length) {
    window.xpAlert('Aucune donnée trouvée dans le fichier.', 'warning');
    return;
  }

  // Referência do dossier activo
  let activeRef = '';
  try {
    if (typeof window._taskRef === 'function') {
      activeRef = window._taskRef();
    } else {
      activeRef = (document.getElementById('booking-ref') || {}).value
               || localStorage.getItem('expatur_active_dossier') || '';
    }
  } catch(_) {}

  // Tarefas existentes
  let existing = [];
  try {
    if (typeof window._loadTasks === 'function') existing = window._loadTasks() || [];
    else existing = JSON.parse(localStorage.getItem('tasks_v2_' + activeRef) || '[]');
  } catch(_) {}

  const merged = (existing || []).slice();
  let imported = 0;
  let skipped  = 0;

  rows.forEach(function(row) {
    // Título da tarefa
    const text = _col(row, ['task','tâche','tache','title','titre','description','nom','name']);
    if (!text || text.length < 2) { skipped++; return; }

    // Categoria (via Project ou Category)
    const projRaw = _col(row, ['project','projet','catégorie','categorie','category','cat']);
    const cat = _mapCat(projRaw);

    // Prioridade
    const prioRaw = (_col(row, ['priority','priorité','priorite','prio']) || '').toLowerCase();
    const prio = ['haute','high'].includes(prioRaw) ? 'haute'
               : ['basse','low'].includes(prioRaw)  ? 'basse'
               : 'normal';

    // Data de vencimento
    const dueRaw = _col(row, ['deadline','échéance','echeance','due date','duedate','due']);
    const dueDate = _parseDate(dueRaw);

    // Status → done
    const statusRaw = (_col(row, ['status','statut','état','etat']) || '').toLowerCase();
    const done = ['completed','conclu','done','terminé','termine','fermé','ferme'].some(
      function(s) { return statusRaw.includes(s); }
    );

    // Comentário / notas
    let comment = _col(row, ['description','commentaire','comment','note','notes','remarque']);
    // Incluir assignee no comentário se disponível
    const assignee = _col(row, ['assignee','assigné','assigne','responsable']);
    if (assignee) comment = (comment ? comment + '\n' : '') + 'Assignée: ' + assignee;

    merged.push({
      id:        Date.now() + Math.random(),
      text:      text,
      done:      done,
      prio:      prio,
      cat:       cat,
      dueDate:   dueDate,
      dueDesc:   '',
      comment:   comment || '',
      createdAt: new Date().toISOString(),
    });
    imported++;
  });

  if (!imported) {
    window.xpAlert('Aucune tâche valide importée.\n\nVérifiez que le fichier contient une colonne "Task" ou "Description".', 'warning');
    return;
  }

  // Guardar
  try {
    if (typeof window._tpWriteDossierTasks === 'function') {
      window._tpWriteDossierTasks(activeRef, merged);
    } else {
      localStorage.setItem('tasks_v2_' + activeRef, JSON.stringify(merged));
    }
  } catch(e) {
    window.xpAlert('Tarefas importadas localmente mas erro ao guardar: ' + e.message, 'warning');
  }

  // Actualizar UI
  try { window._tasks = merged.slice(); } catch(_) {}
  try { if (typeof window.renderTasks === 'function') window.renderTasks(); } catch(_) {}
  try { if (typeof window.tarefasRender === 'function') window.tarefasRender(); } catch(_) {}
  try { if (typeof window.welcomeRefresh === 'function') window.welcomeRefresh(); } catch(_) {}

  const msg = `✓ ${imported} tarefa(s) importada(s)`
    + (skipped ? `\n${skipped} linha(s) ignorada(s) (sem título)` : '');
  window.xpAlert(msg, 'success');
}

// ── Override da função original ───────────────────────────────────────────────
function importTasksFromExcelV2(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const arrayBuffer = e.target.result;

      let rows;

      if (_isHtml(arrayBuffer)) {
        // Ficheiro HTML (ex: exportação Bitrix24)
        const text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));
        rows = _parseHtmlXls(text);
        if (!rows || !rows.length) {
          window.xpAlert('Não foi possível ler o ficheiro HTML.\nVerifique o formato do ficheiro.', 'error');
          return;
        }
      } else {
        // XLS/XLSX real
        rows = _parseXlsx(arrayBuffer);
      }

      _doImport(rows);
    } catch(err) {
      console.error('[task-import]', err);
      window.xpAlert('Erro ao importar: ' + (err.message || err), 'error');
    } finally {
      try { input.value = ''; } catch(_) {}
    }
  };
  reader.readAsArrayBuffer(file);
}

// Substituir a função original assim que o DOM carregar
(function() {
  function _override() {
    window.importTasksFromExcel = importTasksFromExcelV2;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _override);
  } else {
    _override();
    setTimeout(_override, 500);
  }
})();

// ══════════════════════════════════════════════════════════════════════════════
// PATCH XLSX.read — suporte a ficheiros XLS baseados em HTML (Bitrix24, etc.)
//
// O modal "Importar Excel" em Tarefas usa XLSX.read() que falha com HTML.
// Este patch:
//  1. Detecta se os dados são HTML (começa com <meta|<table|<html)
//  2. Converte a tabela HTML em workbook XLSX usando XLSX.utils.table_to_book
//  3. Normaliza os nomes das colunas Bitrix24 → nomes esperados pelo modal:
//       Task        → title
//       Project     → categoria
//       Deadline    → vencimento
//       Status      → _status (para lógica de done)
//       Description → descricao
//       Assignee    → assignee
// ══════════════════════════════════════════════════════════════════════════════

// Mapeamento de colunas Bitrix24 → aliases usados pelo modal
const BITRIX_COL_MAP = {
  'task':         'title',
  'project':      'categoria',
  'deadline':     'vencimento',
  'status':       '_status',
  'description':  'descricao',
  'assignee':     'assignee',
  'id':           '_id',
};

function _normalizeBitrixRow(row) {
  const normalized = {};
  Object.keys(row).forEach(function(k) {
    const lower = k.toLowerCase().trim();
    const mapped = BITRIX_COL_MAP[lower] || lower;
    normalized[mapped] = row[k];
  });
  return normalized;
}

function _htmlToWorkbook(arrayBuffer) {
  const text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));

  // Criar elemento DOM temporário para o browser parsear o HTML
  const div = document.createElement('div');
  div.innerHTML = text;
  const table = div.querySelector('table');
  if (!table || !window.XLSX) return null;

  // Usar XLSX.utils.table_to_book para converter a tabela HTML em workbook
  const wb = window.XLSX.utils.table_to_book(table, { sheet: 'Sheet1', raw: false });

  // Normalizar as colunas de todas as folhas
  wb.SheetNames.forEach(function(sheetName) {
    const ws = wb.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return;

    // Verificar se é formato Bitrix24 (tem coluna 'Task')
    const isBitrix = Object.keys(rows[0]).some(function(k) {
      return k.toLowerCase().trim() === 'task';
    });

    if (isBitrix) {
      // Normalizar colunas e re-construir o workbook
      const normalized = rows.map(_normalizeBitrixRow);
      const newWs = window.XLSX.utils.json_to_sheet(normalized);
      wb.Sheets[sheetName] = newWs;
    }
  });

  return wb;
}

function _patchXLSXRead() {
  if (!window.XLSX || window.XLSX.__htmlPatched) return;

  const _origRead = window.XLSX.read.bind(window.XLSX);

  window.XLSX.read = function(data, opts) {
    // Verificar se é HTML
    let isHtmlFile = false;
    try {
      const arr = (data instanceof Uint8Array)
        ? data
        : new Uint8Array(ArrayBuffer.isView(data) ? data.buffer : data);
      const head = new TextDecoder().decode(arr.slice(0, 300));
      isHtmlFile = /<html|<meta|<table|<thead/i.test(head);
    } catch(_) {}

    if (isHtmlFile) {
      try {
        const buf = (data instanceof Uint8Array) ? data.buffer : data;
        const wb = _htmlToWorkbook(buf instanceof ArrayBuffer ? buf : data.buffer || data);
        if (wb) return wb;
      } catch(e) {
        console.warn('[task-import] HTML fallback failed:', e.message);
      }
    }

    return _origRead(data, opts);
  };

  window.XLSX.__htmlPatched = true;
  console.info('[task-import] XLSX.read patched — HTML-based XLS now supported');
}

// Aplicar patch assim que XLSX estiver disponível
(function waitForXLSX() {
  if (window.XLSX) {
    _patchXLSXRead();
  } else {
    // XLSX é carregado com defer — esperar
    window.addEventListener('load', _patchXLSXRead);
    setTimeout(_patchXLSXRead, 1000);
    setTimeout(_patchXLSXRead, 3000);
  }
})();
