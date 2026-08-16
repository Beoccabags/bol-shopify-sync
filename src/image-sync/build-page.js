const fs = require('fs');
const plan = JSON.parse(fs.readFileSync(__dirname + '/upload-plan.json', 'utf8'));
const thumbs = JSON.parse(fs.readFileSync(__dirname + '/thumbs.json', 'utf8'));
const chunkNames = { '80005084': 'Rugzak', '30007530': 'Portemonnee', '80007251': 'Creditcardhouder',
  '30016703': 'Tas', '30010311': 'Kledingriem', '30007552': 'Laptoptas', '80005972': 'Toilettas' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const byProduct = new Map();
for (const [ean, p] of Object.entries(plan)) {
  if (!byProduct.has(p.product)) byProduct.set(p.product, []);
  byProduct.get(p.product).push({ ean, ...p });
}
const totalImgs = Object.values(plan).reduce((s, p) => s + p.assets.length, 0);
const labelCounts = {};
for (const p of Object.values(plan)) for (const a of p.assets) labelCounts[a.labels[0]] = (labelCounts[a.labels[0]] || 0) + 1;
const LABELS = ['FRONT', 'SIDE', 'BACK', 'INSIDE', 'DETAIL', 'IN SITU', 'OTHER'];

const sections = [...byProduct.entries()].map(([title, variants]) => `
<section class="prod">
  <header class="prod-h">
    <h2>${esc(title)}</h2>
    <span class="prod-meta">${variants.length} variant${variants.length > 1 ? 'en' : ''} · ${chunkNames[variants[0].chunkId] || variants[0].chunkId}</span>
  </header>
  ${variants.map(v => `
  <article class="var">
    <div class="var-id">
      <h3>${esc(v.variant)}</h3>
      <dl>
        <div><dt>EAN</dt><dd class="mono">${esc(v.ean)}</dd></div>
        <div><dt>SKU</dt><dd class="mono">${esc(v.sku || '—')}</dd></div>
        <div><dt>Foto's</dt><dd class="mono">${v.assets.length}</dd></div>
      </dl>
      ${v.ean !== v.shopEan ? `<p class="warn">Afwijkende EAN op bol · Shopify ${esc(v.shopEan)}</p>` : ''}
    </div>
    <ol class="strip">
      ${v.assets.map((a, i) => `
      <li class="shot${i === 0 ? ' is-first' : ''}">
        <figure>
          ${thumbs[a.url] ? `<img src="${thumbs[a.url]}" alt="${esc(a.file)}" loading="lazy">` : '<div class="miss">geen preview</div>'}
          <figcaption>
            <span class="chip chip--${a.labels[0].replace(/ /g, '')}">${esc(a.labels[0])}</span>
            <span class="fname" title="${esc(a.file)}">${esc(a.file)}</span>
          </figcaption>
        </figure>
      </li>`).join('')}
    </ol>
  </article>`).join('')}
</section>`).join('');

const html = `<title>Beocca Bol Fotocontrole</title>
<style>
:root{
  --ground:#faf8f4; --surface:#ffffff; --sunk:#f2eee7;
  --ink:#1b1815; --ink-2:#5f574c; --ink-3:#8b8175;
  --line:#e5ded3; --line-2:#d3c9ba;
  --brass:#9a6f21; --brass-soft:#f0e4cb; --warn:#8a4a20; --warn-soft:#f6e4d8;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#14120e; --surface:#1d1a15; --sunk:#232019;
  --ink:#efe9df; --ink-2:#b3a998; --ink-3:#867c6d;
  --line:#302b23; --line-2:#413a2f;
  --brass:#d9a94f; --brass-soft:#3a2f18; --warn:#e0a173; --warn-soft:#3d2618;
}}
:root[data-theme="dark"]{
  --ground:#14120e; --surface:#1d1a15; --sunk:#232019;
  --ink:#efe9df; --ink-2:#b3a998; --ink-3:#867c6d;
  --line:#302b23; --line-2:#413a2f;
  --brass:#d9a94f; --brass-soft:#3a2f18; --warn:#e0a173; --warn-soft:#3d2618;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px 96px}

.top{border-bottom:1px solid var(--line);background:var(--ground);padding:56px 0 28px;margin-bottom:8px}
.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--brass);margin:0 0 14px;font-weight:600}
h1{font-family:"Iowan Old Style",Palatino,"Palatino Linotype",Georgia,serif;
  font-weight:600;font-size:clamp(30px,4.4vw,46px);line-height:1.08;margin:0 0 12px;text-wrap:balance;letter-spacing:-.01em}
.lede{margin:0;max-width:62ch;color:var(--ink-2);font-size:16px}

.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:12px 18px;min-width:112px}
.stat b{display:block;font-size:26px;font-weight:600;letter-spacing:-.02em;
  font-family:ui-monospace,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums;line-height:1.15}
.stat span{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)}

.legend{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-top:26px;
  padding-top:20px;border-top:1px solid var(--line)}
.legend .lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin-right:4px}

.chip{display:inline-block;font-size:10px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;
  padding:2px 6px;border-radius:2px;border:1px solid var(--line-2);color:var(--ink-2);background:var(--sunk);white-space:nowrap}
.chip--FRONT{background:var(--brass);border-color:var(--brass);color:var(--ground)}
.chip--DETAIL,.chip--INSITU{border-color:var(--brass);color:var(--brass);background:var(--brass-soft)}

.prod{margin-top:52px}
.prod-h{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;
  padding-bottom:10px;border-bottom:2px solid var(--ink);margin-bottom:4px}
.prod-h h2{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;
  font-size:22px;margin:0;letter-spacing:-.01em}
.prod-meta{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)}

.var{display:grid;grid-template-columns:190px minmax(0,1fr);gap:26px;
  padding:22px 0;border-bottom:1px solid var(--line)}
.var-id h3{margin:0 0 10px;font-size:15px;font-weight:650;letter-spacing:-.005em}
.var-id dl{margin:0;display:flex;flex-direction:column;gap:3px}
.var-id dl div{display:flex;gap:8px;font-size:12px}
.var-id dt{color:var(--ink-3);min-width:44px;letter-spacing:.04em}
.var-id dd{margin:0;color:var(--ink-2)}
.warn{margin:10px 0 0;font-size:11.5px;line-height:1.4;color:var(--warn);
  background:var(--warn-soft);border-left:2px solid var(--warn);padding:5px 8px}

.strip{list-style:none;margin:0;padding:0 0 6px;display:flex;gap:12px;overflow-x:auto;scrollbar-width:thin}
.shot{flex:0 0 118px}
.shot figure{margin:0;display:flex;flex-direction:column;gap:6px}
.shot img{width:118px;height:118px;object-fit:cover;display:block;
  background:var(--sunk);border:1px solid var(--line);border-radius:2px}
.shot.is-first img{border-color:var(--brass);box-shadow:0 0 0 2px var(--brass-soft)}
.miss{width:118px;height:118px;display:grid;place-items:center;font-size:10px;color:var(--ink-3);
  background:var(--sunk);border:1px dashed var(--line-2);border-radius:2px}
figcaption{display:flex;flex-direction:column;gap:3px;min-width:0}
.fname{font-size:9.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:ui-monospace,Menlo,monospace}

@media (max-width:760px){
  .var{grid-template-columns:1fr;gap:14px}
  .wrap{padding:0 16px 64px}
}
</style>

<div class="top"><div class="wrap">
  <p class="eyebrow">Beocca · bol.com productcontent</p>
  <h1>Welke Shopify-foto's naar welke bol-variant gaan</h1>
  <p class="lede">Elke variant hieronder krijgt precies deze afbeeldingen op bol, in deze volgorde. De omrande foto is de hoofdafbeelding (label FRONT) — die staat straks vooraan in de carrousel. Controleer vooral of de kleur van elke foto klopt bij de variant ernaast.</p>
  <div class="stats">
    <div class="stat"><b>${Object.keys(plan).length}</b><span>Varianten</span></div>
    <div class="stat"><b>${totalImgs}</b><span>Afbeeldingen</span></div>
    <div class="stat"><b>${byProduct.size}</b><span>Producten</span></div>
    <div class="stat"><b>${new Set(Object.values(plan).map(p => p.chunkId)).size}</b><span>Categorieën</span></div>
  </div>
  <div class="legend"><span class="lbl">Labels</span>
    ${LABELS.filter(l => labelCounts[l]).map(l => `<span class="chip chip--${l.replace(/ /g, '')}">${l} ${labelCounts[l]}</span>`).join('')}
  </div>
</div></div>

<div class="wrap">${sections}</div>`;

fs.writeFileSync(__dirname + '/fotocontrole.html', html);
console.log('geschreven:', (html.length / 1048576).toFixed(1), 'MB');
