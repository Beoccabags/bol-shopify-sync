// Controlepagina: per EAN oud vs nieuw (NL + FR) en de attribuutcorrecties.
const fs = require('fs');
const plan = JSON.parse(fs.readFileSync(__dirname + '/content-plan.json', 'utf8'));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (p, lang, id) => { const a = p[lang].attributes.find(x => x.id === id); return a ? a.values.map(v => v.value + (v.unitId ? ' ' + v.unitId.split('.').pop() : '')).join('; ') : ''; };
let rows = '';
for (const [ean, p] of Object.entries(plan)) {
  const fixes = Object.keys(p.oldFix).map(k => `<tr><td>${esc(k)}</td><td class="old">${esc(p.oldFix[k])}</td><td class="new">${esc(attr(p, 'nl', k))}</td></tr>`).join('');
  rows += `<section class="card"><h2>${esc(p.product)} <span>${esc(p.variant)}</span> <code>${ean}</code> <small>chunk ${p.chunk}</small></h2>
  ${['nl', 'fr'].map(l => `<div class="lang"><h3>${l.toUpperCase()}</h3>
    <div class="pair"><div><h4>Titel oud</h4><p class="old">${esc(p.old[l].title)}</p></div><div><h4>Titel nieuw</h4><p class="new">${esc(attr(p, l, 'Name'))}</p></div></div>
    <div class="pair"><div><h4>Kleur oud</h4><p class="old">${esc(p.old[l].colour)}</p></div><div><h4>Kleur nieuw</h4><p class="new">${esc(attr(p, l, 'Colour'))}</p></div></div>
    <div class="pair"><div><h4>Beschrijving oud</h4><div class="old desc">${p.old[l].desc || ''}</div></div><div><h4>Beschrijving nieuw</h4><div class="new desc">${attr(p, l, 'Description')}</div></div></div>
  </div>`).join('')}
  ${fixes ? `<h3>Attribuutcorrecties (NL-upload)</h3><table><tr><th>Attribuut</th><th>Oud</th><th>Nieuw</th></tr>${fixes}</table>` : ''}
  </section>`;
}
const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bol content review</title>
<style>:root{--bg:#f6f4f0;--card:#fff;--ink:#222;--muted:#666;--old:#fbeaea;--new:#e8f4ea;--line:#ddd}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#17161a;--card:#222126;--ink:#eee;--muted:#aaa;--old:#3a2323;--new:#1f3a26;--line:#444}}
:root[data-theme=dark]{--bg:#17161a;--card:#222126;--ink:#eee;--muted:#aaa;--old:#3a2323;--new:#1f3a26;--line:#444}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 18px}
h2{font-size:17px;margin:0 0 10px}h2 span{color:var(--muted);font-weight:400}h2 code{font-size:12px;margin-left:8px}h2 small{color:var(--muted);font-weight:400;margin-left:8px}
h3{font-size:14px;margin:14px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}h4{font-size:12px;margin:8px 0 4px;color:var(--muted)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:800px){.pair{grid-template-columns:1fr}}
.old{background:var(--old);padding:8px 10px;border-radius:6px}.new{background:var(--new);padding:8px 10px;border-radius:6px}
.desc{font-size:13px}.desc h3{text-transform:none;letter-spacing:0;color:inherit;font-size:14px;margin:8px 0 4px}.desc ul{padding-left:18px;margin:4px 0}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left}td.old{background:var(--old)}td.new{background:var(--new)}</style></head>
<body><h1>Beocca op bol.com: nieuwe content per EAN</h1><p class="sub">${Object.keys(plan).length} EAN's, NL en FR. Rood is wat er stond, groen is wat is ingestuurd.</p>${rows}</body></html>`;
const out = process.argv[2] || (__dirname + '/bol-content-review.html');
fs.writeFileSync(out, html); console.log('geschreven:', out, html.length, 'bytes');
