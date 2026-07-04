/**
 * md-to-pdf.mjs — Converte um Markdown em PDF usando o Google Chrome headless.
 * Uso: node scripts/md-to-pdf.mjs <entrada.md> [saida.pdf]
 */
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, basename } from 'path';

const inFile = process.argv[2];
if (!inFile) { console.error('Uso: node scripts/md-to-pdf.mjs <entrada.md> [saida.pdf]'); process.exit(1); }
const outFile = resolve(process.argv[3] || inFile.replace(/\.md$/i, '.pdf'));
const md = readFileSync(inFile, 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

const lines = md.split('\n');
let html = '';
let inUl = false, inCode = false, tableBuf = [];
const closeUl = () => { if (inUl) { html += '</ul>\n'; inUl = false; } };
function flushTable() {
  if (!tableBuf.length) return;
  const rows = tableBuf.map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const header = rows[0];
  const body = rows.slice(2); // rows[1] = separador ---
  html += '<table><thead><tr>' + header.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
  body.forEach((r) => { html += '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>'; });
  html += '</tbody></table>\n';
  tableBuf = [];
}

for (const raw of lines) {
  const line = raw.replace(/\s+$/, '');
  if (/^```/.test(line)) { if (inCode) { html += '</pre>\n'; inCode = false; } else { closeUl(); flushTable(); html += '<pre>'; inCode = true; } continue; }
  if (inCode) { html += esc(raw) + '\n'; continue; }
  if (/^\s*\|.*\|\s*$/.test(line)) { closeUl(); tableBuf.push(line.trim()); continue; }
  flushTable();
  if (!line.trim()) { closeUl(); continue; }
  if (/^---+$/.test(line)) { closeUl(); html += '<hr>\n'; continue; }
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) { closeUl(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>\n`; continue; }
  const cb = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
  if (cb) {
    if (!inUl) { html += '<ul class="cl">\n'; inUl = true; }
    const done = cb[1].toLowerCase() === 'x';
    html += `<li class="${done ? 'done' : 'todo'}"><span class="box">${done ? '✅' : '☐'}</span><span>${inline(cb[2])}</span></li>\n`;
    continue;
  }
  const li = line.match(/^\s*[-*]\s+(.*)$/);
  if (li) { if (!inUl) { html += '<ul>\n'; inUl = true; } html += `<li>${inline(li[1])}</li>\n`; continue; }
  const bq = line.match(/^>\s?(.*)$/);
  if (bq) { closeUl(); html += `<blockquote>${inline(bq[1])}</blockquote>\n`; continue; }
  closeUl();
  html += `<p>${inline(line)}</p>\n`;
}
closeUl(); flushTable(); if (inCode) html += '</pre>';

const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@page { margin: 16mm 15mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.5; }
h1 { font-size: 22px; color: #06203b; border-bottom: 3px solid #d80505; padding-bottom: 6px; margin: 0 0 12px; }
h2 { font-size: 16px; color: #06203b; background: #eef2f7; padding: 5px 9px; border-left: 4px solid #06203b; margin: 20px 0 8px; }
h3 { font-size: 13px; color: #0a3158; margin: 14px 0 5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
p { margin: 5px 0; }
a { color: #0a3158; text-decoration: none; }
code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; color: #b91c1c; }
hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
blockquote { border-left: 3px solid #c9a227; background: #fffdf5; margin: 8px 0; padding: 5px 10px; color: #555; }
ul { margin: 4px 0 10px; padding-left: 18px; }
ul.cl { list-style: none; padding-left: 2px; }
ul.cl li { display: flex; gap: 7px; align-items: baseline; margin: 2px 0; page-break-inside: avoid; }
ul.cl li .box { flex-shrink: 0; font-size: 0.95em; }
ul.cl li.todo { color: #9ca3af; }
ul.cl li.todo .box { color: #9ca3af; }
ul.cl li.done .box { color: #16a34a; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10px; }
th, td { border: 1px solid #d1d5db; padding: 4px 7px; text-align: left; vertical-align: top; }
th { background: #06203b; color: #fff; font-weight: 600; }
tr:nth-child(even) td { background: #f8fafc; }
h2, h3 { page-break-after: avoid; }
</style></head><body>${html}</body></html>`;

const tmpHtml = outFile.replace(/\.pdf$/i, '') + '.__tmp.html';
writeFileSync(tmpHtml, doc);
try {
  execFileSync('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${outFile}`, 'file://' + tmpHtml,
  ], { stdio: 'pipe' });
  console.log('✓ PDF gerado:', outFile);
} finally {
  rmSync(tmpHtml, { force: true });
}
