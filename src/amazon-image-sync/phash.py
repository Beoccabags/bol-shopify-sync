import json, sys, io, urllib.request, concurrent.futures as cf
from PIL import Image

cc = sys.argv[1]
data = json.load(open(f'readback-{cc}.json'))

def small(u):
    if 'media-amazon.com' in u:
        return u.rsplit('.', 1)[0] + '._SL160_.' + u.rsplit('.', 1)[1]
    return u.split('?')[0] + '?width=160'

def ahash(u):
    try:
        req = urllib.request.Request(small(u), headers={'User-Agent': 'Mozilla/5.0'})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=25).read()))
        im = im.convert('L').resize((8, 8), Image.LANCZOS)
        px = list(im.getdata()); avg = sum(px)/64
        return sum(1 << i for i, p in enumerate(px) if p > avg)
    except Exception:
        return None

urls = {u for v in data.values() for u in v['live'] + v['planned']}
hashes = {}
with cf.ThreadPoolExecutor(12) as ex:
    for u, h in zip(urls, ex.map(ahash, urls)):
        hashes[u] = h

def dist(a, b):
    return bin(a ^ b).count('1') if a is not None and b is not None else 99

perfect, order_issues, missing, unreadable = [], [], [], []
for sku, v in data.items():
    lh = [hashes.get(u) for u in v['live']]
    ph = [hashes.get(u) for u in v['planned']]
    if any(h is None for h in lh + ph):
        unreadable.append(sku)
    n = min(len(lh), len(ph))
    mism = [i for i in range(n) if dist(lh[i], ph[i]) > 6]
    if len(v['live']) < len(v['planned']):
        missing.append((sku, v['product'], v['variant'], len(v['live']), len(v['planned'])))
    if mism:
        # zit de geplande foto elders in de live-reeks?
        detail = []
        for i in mism:
            found = next((j for j, h in enumerate(lh) if dist(h, ph[i]) <= 6), None)
            detail.append(f'slot{i}->{"live slot "+str(found) if found is not None else "ONTBREEKT"}')
        order_issues.append((sku, v['product'], v['variant'], detail))
    elif len(v['live']) == len(v['planned']):
        perfect.append(sku)

print(f'{cc}: {len(perfect)}/{len(data)} SKU\'s exact goed (juiste foto, juiste volgorde)')
print(f'nog niet volledig verwerkt: {len(missing)}')
for m in missing: print('   ', m[1], '—', m[2], f'({m[3]}/{m[4]} beelden)')
print(f'volgorde/inhoud afwijkend: {len(order_issues)}')
for o in order_issues[:15]: print('   ', o[1], '—', o[2], ':', ', '.join(o[3][:4]))
if unreadable: print('niet te lezen:', len(unreadable))
