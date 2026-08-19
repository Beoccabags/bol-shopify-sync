# Bol.com ↔ Shopify Sync

Koppelt Bol.com en Shopify:

1. **Orders** — Bol.com orders worden als Shopify order aangemaakt (elk kwartier)
2. **Voorraad** — Shopify voorraad wordt naar Bol.com gepusht (1x per dag)
3. **Verzending** — trackingnummers uit Shopify worden bij Bol.com gemeld (elk kwartier, op productniveau)

Daarnaast staan in deze repo de afbeeldingen-syncs naar bol.com, Amazon en
Kaufland.

## Features

### Orders (Bol.com → Shopify)

- Haalt open FBR orders op van Bol.com
- Zoekt of maakt klanten aan in Shopify
- Matcht producten op EAN/barcode
- Handelt prijsverschillen af (duurder/goedkoper)
- Voorkomt dubbele verwerking via order tracking
- Voegt "bol" tag en marketplace bestelnummer toe

### Voorraad (Shopify → Bol.com)

- Haalt alle offers op via de Bol.com offer export
- Matcht op EAN (Bol) ↔ barcode (Shopify)
- Stuurt alleen wijzigingen door, dus geen onnodige API-calls
- Optionele veiligheidsmarge (buffer), maximum en dry-run
- FBB-offers worden overgeslagen; die voorraad ligt bij Bol.com

### Verzending (Shopify → Bol.com)

- Zoekt afgehandelde Shopify orders met de tag `bol`
- Meldt de zending bij Bol.com **per artikel**, dus een bestelling met meerdere
  artikelen kan in losse deelzendingen met eigen trackingnummers gemeld worden
- Vertaalt de Shopify vervoerder naar de juiste Bol.com transporter code
  (let op: PostNL heet bij Bol.com `TNT`)
- Dubbele meldingen worden voorkomen: bij Bol.com al verzonden aantallen
  (`quantityShipped`) worden overgeslagen en volledig gemelde orders krijgen de
  tag `bol-verzonden`

### Afbeeldingen-sync (Shopify → marketplaces)

- Zet de productfoto's uit Shopify per variant op **bol.com** (`src/image-sync/`),
  op **Amazon** DE/FR/NL/BE (`src/amazon-image-sync/`) en op **Kaufland**
  (9 storefronts, `src/kaufland-image-sync/`)
- Koppelt foto's aan varianten op kleur, ook als Shopify maar één beeld per
  variant koppelt
- Labelt elke foto volgens bol's datamodel per productcategorie
- Bouwt een visuele controlepagina om vóór het pushen na te lopen
- Zie de README in die mappen voor de werkwijze en de valkuilen

## Setup

### 1. Shopify Voorbereidingen

1. **Private App aanmaken:**
   - Ga naar Shopify Admin > Apps > Develop apps
   - Maak een nieuwe app aan
   - Configureer scopes:
     - `write_draft_orders`, `write_customers`, `read_products` (orders)
     - `read_inventory` (voorraadsync)
     - `read_orders`, `write_orders` (verzendsync: fulfillments lezen en tag zetten)
   - Installeer de app en kopieer de client credentials

2. **Metafield definitie aanmaken:**
   - Ga naar Settings > Custom data > Draft orders
   - Voeg definitie toe:
     - Namespace: `custom`
     - Key: `marketplace_bestelnummer`
     - Type: Single line text

3. **Prijsverschil product aanmaken:**
   - Maak een product aan genaamd "Bol Prijsverschil"
   - Geen fysiek product, wel belastbaar
   - Kopieer de Variant ID (te vinden in de URL bij bewerken)

4. **Barcodes vullen:**
   - Elke variant die op Bol.com staat, moet in Shopify de EAN als barcode hebben.
     Zowel de voorraadsync als de verzendsync matcht daarop.

### 2. Bol.com Voorbereidingen

1. Ga naar Seller Dashboard > Instellingen > API Instellingen
2. Maak API credentials aan of kopieer bestaande
3. Noteer Client ID en Client Secret

### 3. Configuratie

```bash
cp .env.example .env
```

Vul minimaal in:

```env
BOL_CLIENT_ID=jouw_client_id
BOL_CLIENT_SECRET=jouw_client_secret
SHOPIFY_SHOP=jouw-shop-naam
SHOPIFY_CLIENT_ID=jouw_client_id
SHOPIFY_CLIENT_SECRET=jouw_client_secret
BOL_PRIJSVERSCHIL_VARIANT_ID=gid://shopify/ProductVariant/123456789
```

Alle overige instellingen (buffer, dry-run, tags, tijdstip voorraadsync) staan
met uitleg in `.env.example`.

### 4. Uitvoeren

```bash
npm run sync           # Bol.com orders -> Shopify
npm run sync:tracking  # trackingnummers -> Bol.com
npm run sync:stock     # voorraad -> Bol.com
npm run sync:all       # alles (voorraad alleen in het STOCK_SYNC_HOUR-venster)
npm test               # unit tests van de matching-logica
```

Eerste keer draaien? Zet `BOL_STOCK_DRY_RUN=true` en `TRACKING_DRY_RUN=true` in
`.env`. Dan zie je in de logs precies wat er zou gebeuren zonder dat er iets
naar Bol.com wordt gestuurd.

## Automatisch draaien

### Railway (huidige opzet)

`railway.toml` draait elk kwartier `node index.js all`. Daarin zit:

- ordersync en verzendsync: elke run
- voorraadsync: alleen als het uur gelijk is aan `STOCK_SYNC_HOUR` (standaard 6)

Railway draait in UTC. Zet `TZ=Europe/Amsterdam` als environment variable als je
`STOCK_SYNC_HOUR` in Nederlandse tijd wilt opgeven.

Wil je liever aparte schema's? Maak dan twee Railway services op dezelfde repo:

| Service | startCommand | schedule |
|---------|--------------|----------|
| sync | `node index.js orders && node index.js tracking` | `*/15 * * * *` |
| voorraad | `node index.js stock` | `0 6 * * *` |

### macOS/Linux (cron)

```bash
crontab -e
```

```
*/15 * * * * cd /pad/naar/bol-shopify-sync && /usr/local/bin/node index.js all >> /var/log/bol-sync.log 2>&1
```

## Werking

### Orders (Bol.com → Shopify)

1. Haal Bol.com order op
2. Zoek klant in Shopify (op naam), maak aan indien nodig
3. Per order item: zoek product op EAN en vergelijk prijzen
4. Maak draft order aan met klant, producten, prijsverschil, tag `bol` en het
   metafield `custom.marketplace_bestelnummer`
5. Zet de draft om naar een echte order en markeer als betaald

| Situatie | Actie |
|----------|-------|
| Bol duurder | Extra line item "Bol.com prijsverschil" toegevoegd |
| Bol goedkoper | Korting "korting bol" toegepast |

### Voorraad (Shopify → Bol.com)

1. Vraag de offer export aan bij Bol.com (CSV met offerId, EAN en huidige voorraad)
2. Haal alle Shopify varianten met barcode en beschikbare voorraad op
3. Bereken de nieuwe voorraad: `beschikbaar - BOL_STOCK_BUFFER`, afgekapt op
   0 en `BOL_STOCK_MAX`
4. Alleen als het afwijkt van de huidige Bol.com voorraad: `PUT /offers/{id}/stock`

EAN's die niet in Shopify voorkomen worden standaard overgeslagen (dus niet op 0
gezet). Zet `BOL_STOCK_MISSING_TO_ZERO=true` als je dat wel wilt.

### Verzending (Shopify → Bol.com)

1. Zoek Shopify orders met tag `bol`, zonder tag `bol-verzonden`, die (deels)
   zijn afgehandeld
2. Haal het Bol.com bestelnummer uit het metafield (of de ordernotitie)
3. Haal de Bol.com order op en bepaal per orderitem wat nog openstaat
   (`quantity - quantityShipped - quantityCancelled`)
4. Per fulfillment: match de regels op barcode/EAN aan de openstaande Bol.com
   orderitems en meld ze met het trackingnummer van díe fulfillment
5. Is alles gemeld? Dan krijgt de order in Shopify de tag `bol-verzonden`

Regels zonder variant (zoals het prijsverschil-artikel) worden overgeslagen.

#### Vervoerders

De vervoerder uit Shopify wordt automatisch vertaald, o.a.:

| Shopify | Bol.com code |
|---------|--------------|
| PostNL | `TNT` |
| PostNL briefpost | `TNT_BRIEF` |
| DHL / DHL Express | `DHL` |
| DHL For You | `DHLFORYOU` |
| DPD (NL / BE) | `DPD-NL` / `DPD-BE` |
| bpost | `BPOST_BE` |
| UPS, GLS, FedEx, Trunkrs, Budbee, Cycloon | idem |
| onbekend | `BOL_DEFAULT_TRANSPORTER` (standaard `OTHER`) |

Gebruik je een vervoerder die niet herkend wordt, voeg hem dan toe via
`BOL_TRANSPORTER_MAP`, bijvoorbeeld `{"Mijn Vervoerder":"TNT"}`.

## Bestanden

```
bol-shopify-sync/
├── index.js                # Entry point (orders | stock | tracking | all)
├── src/
│   ├── bol-api.js          # Bol.com API wrapper (orders, offers, shipments)
│   ├── shopify-api.js      # Shopify GraphQL wrapper
│   ├── order-tracker.js    # Tracking verwerkte orders
│   ├── sync.js             # Ordersync Bol.com -> Shopify
│   ├── stock-sync.js       # Voorraadsync Shopify -> Bol.com
│   ├── tracking-sync.js    # Verzendsync Shopify -> Bol.com
│   └── transporters.js     # Vervoerder -> Bol.com transporter code
├── sync-stock.js           # Losse entrypoint voor de voorraadsync
├── src/image-sync/         # Foto's van Shopify naar bol.com
├── src/amazon-image-sync/  # Foto's naar Amazon DE/FR/NL/BE
├── src/kaufland-image-sync/# Foto's naar Kaufland
├── test/                   # Unit tests van de matching-logica
├── processed-orders.json   # Verwerkte order IDs (lokaal)
├── .env                    # Configuratie (niet in git)
└── .env.example            # Configuratie template
```

## Troubleshooting

### "Authenticatie mislukt"
- Controleer of BOL_CLIENT_ID en BOL_CLIENT_SECRET correct zijn
- Controleer of de API credentials actief zijn in Bol Seller Dashboard

### "Product niet gevonden"
- Controleer of het product in Shopify de juiste EAN/barcode heeft ingesteld
- De barcode moet exact overeenkomen met de EAN van Bol.com

### "Draft order aanmaken mislukt"
- Controleer of de Shopify Access Token de juiste scopes heeft
- Controleer of BOL_PRIJSVERSCHIL_VARIANT_ID correct is geformatteerd

### Voorraad wordt niet bijgewerkt
- Draai `npm run sync:stock` en kijk of de EAN in de logs staat als "niet in
  Shopify gevonden" — dan ontbreekt de barcode op de variant
- FBB-offers worden bewust overgeslagen

### Zending wordt niet gemeld
- De order moet in Shopify de tag `bol` hebben en een trackingnummer
- Staat de tag `bol-verzonden` er al op? Dan is alles al gemeld
- Zie je "geen open Bol-item voor ..."? Dan was dat artikel bij Bol.com al
  verzonden of geannuleerd

## License

MIT — see [LICENSE](LICENSE) for details.
