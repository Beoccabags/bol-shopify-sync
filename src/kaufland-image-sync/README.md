# Afbeeldingen-sync: Shopify → Kaufland

Zet de Shopify-productfoto's op Beocca's Kaufland-listings, voor alle negen
storefronts/talen. Gebruikt de Seller API v2 (`PATCH /product-data/`).

Werkt met `../image-sync/variant-images.json` — draai daar eerst
`fetch-shopify.js` en `map-images.js`.

## Volgorde
```bash
node fetch-units.js          # 52 units per storefront      -> units.json
node fetch-eans.js           # id_offer -> EAN via /products -> offer-eans.json
node push-kfl.js             # PATCH per EAN per taal        -> kfl-results.json
node verify-kfl.js de de-DE  # update_status per EAN
node verify-stored.js        # DE ECHTE CONTROLE: leest per taal terug wat is opgeslagen
```

## Account
Beocca heeft een **eigen** Kaufland-sleutelpaar (`KAUFLAND_*` in `.env`). Dat is
een ánder paar dan het EXIT/Dutch-Toys-Group-paar dat in
`~/.claude/scripts/kaufland_cs_automation.py` staat. Controleer bij twijfel met
`GET /units?storefront=de&limit=1`: Beocca heeft `id_offer` als `PM-CO-01-DE`,
EXIT heeft artikelnummers als `10.82.17.00`.

## Storefronts en talen
Negen, elk met 52 units: de/de-DE, at/de-AT, cz/cs-CZ, sk/sk-SK, pl/pl-PL,
nl/nl-NL, fr/fr-FR, es/es-ES, it/it-IT. (ro, bg, hr, md zijn niet geconfigureerd.)
Foto's zijn taalonafhankelijk, maar `locale` is verplicht, dus dezelfde lijst
gaat negen keer de deur uit.

## Valkuilen
- **Handtekening:** `HMAC_SHA256_hex(secret, "METHOD\nURL\nBODY\nTIMESTAMP")` —
  vier regels, géén afsluitende newline. Een newline te veel geeft
  401 "signature is corrupted". De URL moet exact de verstuurde string zijn,
  inclusief query, met percent-encoded brackets.
- **`PATCH /product-data/` (mét slash), niet POST.** PATCH overschrijft alleen
  de meegestuurde attributen; PUT vervangt de héle productdata. Voor foto's dus
  altijd PATCH met enkel `{ean, attributes:{picture:[...]}}`.
- **`locale` is verplicht** en `storefront` ook, óók op het status-endpoint
  `GET /product-data/status/{ean}`. Geldige locales staan in de foutmelding als
  je een onbestaande meegeeft.
- **Controleer op `GET /product-data/{ean}`, niet op `main_picture`.** Dat
  endpoint geeft terug wat Kaufland van jou heeft opgeslagen, inclusief de
  volledige `picture`-lijst in volgorde — dat is de enige directe bevestiging
  dat een push geland is. Het veld `main_picture` op `/products/{id}` is de
  gepubliceerde catalogusfoto; die wordt asynchroon herbergd en liep hier na een
  half uur nog volledig achter. Wie daarop verifieert concludeert ten onrechte
  dat de push mislukt is (`pics-kfl.js`/`phash-kfl.py` meten dus publicatie,
  niet inzending).
- Het `attribute_values`-blok in de status toont alleen attributen die nog
  beoordeeld of omgezet worden; `picture` staat er niet in, ook niet als het
  goed is aangekomen.
- **SKU-namen zijn niet betrouwbaar:** `TT-ZW-01` ("zwart") is in werkelijkheid
  de Miles Cognac. Koppel op de EAN uit `/products/{id_product}`, niet op de SKU.
- `/products` is alleen-lezen en toont maar één `main_picture`; de volledige
  fotolijst is via de API niet terug te lezen.
