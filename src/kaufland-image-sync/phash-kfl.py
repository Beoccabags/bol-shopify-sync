import json, sys, io, urllib.request, concurrent.futures as cf
from PIL import Image
sf = sys.argv[1]
data = json.load(open(f'kfl-pics-{sf}.json'))
def ahash(u):
    try:
        if not u: return None
        url = u.split('?')[0] + ('?width=200' if 'cdn.shopify' in u else '')
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=25).read()))
        im = im.convert('L').resize((8,8), Image.LANCZOS)
        px = list(im.getdata()); avg = sum(px)/64
        return sum(1 << i for i,p in enumerate(px) if p > avg)
    except Exception: return None
urls = {u for v in data.values() for u in (v['live'], v['planned']) if u}
h = {}
with cf.ThreadPoolExecutor(10) as ex:
    for u, x in zip(urls, ex.map(ahash, urls)): h[u] = x
ok, bad, unread = 0, [], 0
for ean, v in data.items():
    a, b = h.get(v['live']), h.get(v['planned'])
    if a is None or b is None: unread += 1; continue
    if bin(a ^ b).count('1') <= 6: ok += 1
    else: bad.append((ean, v['product'], v['variant']))
print(f'{sf}: hoofdafbeelding correct {ok}/{len(data)}')
for e,p,vv in bad: print('   wijkt af:', e, p, '—', vv)
if unread: print('   niet te lezen:', unread)
