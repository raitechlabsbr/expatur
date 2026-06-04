#!/usr/bin/env python3
"""
extract.py — Extrai o index.html monolítico para a nova estrutura Vite.

Gera:
  src/styles/main.css   — todo CSS inline consolidado
  src/js/app.js         — todo JS consolidado + window exports para ES module
  src/html/body.html    — HTML do body sem scripts/styles
  index-app.html        — shell limpo
"""
import re, os

SRC = '/home/israel/Documentos/expatur/index.html'
BASE = '/home/israel/Documentos/expatur'

with open(SRC, 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. CSS ────────────────────────────────────────────────────────────────────
css_blocks_all = re.findall(r'<style(?:\s[^>]*)?>(.+?)</style>', content, re.DOTALL)
# Skip blocks that are JS template literals (dynamically injected styles like ${_letterCSS})
css_blocks = [b for b in css_blocks_all if '${' not in b]
css_combined = '\n\n'.join(b.strip() for b in css_blocks)

os.makedirs(f'{BASE}/src/styles', exist_ok=True)
with open(f'{BASE}/src/styles/main.css', 'w', encoding='utf-8') as f:
    f.write(css_combined)
print(f'✓ CSS  → src/styles/main.css  ({len(css_combined)//1024}KB, {len(css_blocks)} blocks)')

# ── 2. HTML body ──────────────────────────────────────────────────────────────
# Use greedy match ([\s\S]*) to find the LAST </body> — avoids stopping at
# </body> inside JavaScript string literals (e.g. win.document.write('...</body></html>'))
body_match = re.search(r'<body[^>]*>([\s\S]*)</body>', content)
body = body_match.group(1) if body_match else ''

# Remove script content — use greedy inner match to handle </body> inside JS strings.
# Strategy: first remove HTML comments (they may contain </script>), then strip scripts.
body_no_comments = re.sub(r'<!--[\s\S]*?-->', '', body)
# Remove script blocks — greedy inner to consume </script> inside string literals
body_stripped = re.sub(r'<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?</script>', '', body_no_comments)
body_stripped = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', body_stripped)
body_stripped = re.sub(r'\n{4,}', '\n\n', body_stripped)

os.makedirs(f'{BASE}/src/html', exist_ok=True)
with open(f'{BASE}/src/html/body.html', 'w', encoding='utf-8') as f:
    f.write(body_stripped.strip())
print(f'✓ HTML → src/html/body.html   ({len(body_stripped)//1024}KB)')

# ── 3. JS ─────────────────────────────────────────────────────────────────────
# Remove HTML comments FIRST — some contain <script> tags inside them (audit docs)
# which would be falsely matched as real script blocks
content_no_comments = re.sub(r'<!--[\s\S]*?-->', '', content)

all_scripts = re.findall(
    r'<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)</script>',
    content_no_comments
)
js_combined = '\n\n// ─────────────────────────────────────\n\n'.join(
    b.strip() for b in all_scripts if b.strip()
)

# ── Gerar window exports para funções chamadas de HTML event handlers ─────────
handler_funcs = set()
for attr in re.findall(r'on\w+="([^"]+)"', body_stripped):
    for fn in re.findall(r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(', attr):
        handler_funcs.add(fn)

window_assigned = set(re.findall(r'window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=', js_combined))
function_declared = set(re.findall(
    r'^(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(',
    js_combined, re.MULTILINE
))

js_builtins = {
    'if','function','var','let','const','return','typeof','new','this',
    'event','window','document','parseInt','parseFloat','encodeURIComponent',
    'decodeURIComponent','String','Object','Array','Date','Math','JSON',
    'setTimeout','clearTimeout','setInterval','console','Promise',
    'fetch','location','alert','confirm','history','navigator',
    'click','remove','stopPropagation','preventDefault','getElementById',
    'querySelector','toUpperCase','add','rgba','print','open','close',
    'toString','valueOf','hasOwnProperty','call','apply','bind',
    'Error','TypeError','RangeError','Map','Set','WeakMap','Symbol',
}

# ── Comprehensive window exports ─────────────────────────────────────────────
# In classic <script> blocks, function declarations are automatically global.
# Inside an IIFE they're local. We need to export to window:
#   1. Functions called from HTML onclick/onchange/etc. handlers
#   2. Functions checked by patches via: typeof window.foo === 'function'
#   3. Functions called as: window.foo()
#
# CRITICAL: These must be placed at the START of the IIFE body, not the end,
# because patch code checks window.foo BEFORE the "end-of-file" position.
# JavaScript hoists function declarations, so they're available immediately.

patch_checked = set(re.findall(
    r"typeof\s+window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*===?\s*['\"]function['\"]",
    js_combined
))
called_via_window = set(re.findall(r'window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', js_combined))

all_needs_window = (handler_funcs | patch_checked) & function_declared - js_builtins

# SAFETY: usa typeof para evitar ReferenceError se a função não for uma declaração
# hoistável (ex: definida só por window.xxx = function() em vez de function xxx() {})
# Um erro aqui para a execução de TODO o IIFE, incluindo window._loginSubmit!
early_exports = '\n'.join(
    f'  if (typeof {fn} === \'function\') window.{fn} = {fn};'
    for fn in sorted(all_needs_window)
)

# ── Wrap in IIFE ──────────────────────────────────────────────────────────────
# Classic script blocks share global scope via function hoisting.
# When concatenated into an ES module, duplicate top-level function declarations
# conflict in strict mode. Wrapping in an IIFE gives function scope — duplicates
# are allowed, last wins, and window.xxx assignments still reach the global scope.
js_final = f'''// Expatur Backoffice — consolidated app.js
// Auto-extracted from index.html by extract.py
// Re-run extract.py to regenerate from the source index.html
/* global jsPDF, html2canvas, XLSX, PDFLib */

(function(window, document) {{
'use strict';

// ── Early window exports (MUST be first — patches check window.xxx) ──────────
// Function declarations are hoisted, so they're available even before their
// source line. Placing exports here ensures patches find them on window.
{early_exports}

// ── App code ─────────────────────────────────────────────────────────────────
{js_combined}

}})(window, document);
'''

os.makedirs(f'{BASE}/src/js', exist_ok=True)
with open(f'{BASE}/src/js/app.js', 'w', encoding='utf-8') as f:
    f.write(js_final)
print(f'✓ JS   → src/js/app.js        ({len(js_final)//1024}KB, {len(all_scripts)} blocks, +{len(all_needs_window)} window exports)')

# ── 4. Shell index-app.html ───────────────────────────────────────────────────
shell = f'''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Expatur — Backoffice</title>

<!-- Critical font — non-blocking (swap so text renders immediately in fallback) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap"
      media="print" onload="this.media=\'all\'">
<noscript>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap">
</noscript>

<!-- App styles (bundled + minified by Vite) -->
<link rel="stylesheet" href="/src/styles/main.css">

<!-- PDF / Excel libs — defer so they don\'t block first paint         -->
<!-- ~4MB combined; browser caches them separately; only used on demand -->
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
</head>
<body>

{body_stripped.strip()}

<!-- App entry point (bundled by Vite) -->
<script type="module" src="/src/js/main.js"></script>
</body>
</html>
'''

with open(f'{BASE}/index-app.html', 'w', encoding='utf-8') as f:
    f.write(shell)
print(f'✓ Shell → index-app.html      ({len(shell)//1024}KB)')

print('''
✅ Extração concluída!

Próximos passos:
  cd /home/israel/Documentos/expatur
  npm install
  npm run dev   # abre em http://localhost:3000/index-app.html
''')
