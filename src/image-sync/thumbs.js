const fs = require('fs');
const plan = JSON.parse(fs.readFileSync(__dirname + '/upload-plan.json', 'utf8'));
const urls = [...new Set(Object.values(plan).flatMap(p => p.assets.map(a => a.url)))];
const cache = fs.existsSync(__dirname + '/thumbs.json') ? JSON.parse(fs.readFileSync(__dirname + '/thumbs.json', 'utf8')) : {};
(async () => {
  let done = 0, fail = 0;
  const queue = urls.filter(u => !cache[u]);
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const base = u.split('?')[0];
      try {
        const r = await fetch(base + '?width=200');
        if (!r.ok) throw new Error(r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        const mime = base.endsWith('.png') ? 'image/png' : 'image/jpeg';
        cache[u] = `data:${mime};base64,${buf.toString('base64')}`;
        done++;
      } catch (e) { cache[u] = null; fail++; }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  fs.writeFileSync(__dirname + '/thumbs.json', JSON.stringify(cache));
  const bytes = Object.values(cache).filter(Boolean).reduce((s, v) => s + v.length, 0);
  console.log('unieke afbeeldingen:', urls.length, '| opgehaald:', done, '| mislukt:', fail,
              '| totaal base64:', (bytes / 1048576).toFixed(1) + ' MB');
})();
