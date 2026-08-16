# Bol.com ↔ Shopify Sync

Synchroniseert Bol.com orders naar Shopify draft orders, en Shopify voorraad naar Bol.com.

## Features

### Order Sync (Bol → Shopify)
- Haalt open FBR orders op van Bol.com
- Zoekt of maakt klanten aan in Shopify
- Matcht producten op EAN/barcode
- Handelt prijsverschillen af (duurder/goedkoper)
- Voorkomt dubbele verwerking via order tracking
- Voegt "bol" tag en marketplace bestelnummer toe

### Stock Sync (Shopify → Bol)
- Haalt voorraadniveaus uit Shopify
- Synchroniseert naar Bol.com offers
- Matcht producten op EAN/barcode
- Rapporteert verschillen en fouten

### Afbeeldingen-sync (Shopify → marketplaces)
- Zet de productfoto's uit Shopify per variant op **bol.com** (`src/image-sync/`)
  op **Amazon** DE/FR/NL/BE (`src/amazon-image-sync/`) en op **Kaufland**
  (9 storefronts, `src/kaufland-image-sync/`)
- Koppelt foto's aan varianten op kleur, ook als Shopify maar één beeld per
  variant koppelt
- Labelt elke foto volgens bol's datamodel per productcategorie
- Bouwt een visuele controlepagina om vóór het pushen na te lopen
- Zie de README in beide mappen voor de werkwijze en de valkuilen

## Setup

### 1. Shopify Voorbereidingen

1. **Private App aanmaken:**
   - Ga naar Shopify Admin > Apps > Develop apps
   - Maak een nieuwe app aan
   - Configureer scopes: `write_draft_orders`, `write_customers`, `read_products`
   - Installeer de app en kopieer het Access Token

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

### 2. Bol.com Voorbereidingen

1. Ga naar Seller Dashboard > Instellingen > API Instellingen
2. Maak API credentials aan of kopieer bestaande
3. Noteer Client ID en Client Secret

### 3. Configuratie

```bash
cp .env.example .env
```

Vul de `.env` in:

```env
BOL_CLIENT_ID=jouw_client_id
BOL_CLIENT_SECRET=jouw_client_secret
SHOPIFY_SHOP=jouw-shop-naam
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
BOL_PRIJSVERSCHIL_VARIANT_ID=gid://shopify/ProductVariant/123456789
```

### 4. Uitvoeren

```bash
# Order sync (Bol → Shopify)
npm start

# Stock sync (Shopify → Bol)
npm run sync:stock
```

### 5. Stock Sync Setup (éénmalig)

De Bol.com API vereist speciale permissies voor het ophalen van offers. Als je API credentials deze niet hebben, moet je handmatig een offers export downloaden:

1. Ga naar [Bol.com Verkopersaccount](https://partner.bol.com)
2. Ga naar **Aanbod** > **Overzicht**
3. Klik op **Exporteer** (rechtsboven)
4. Download de CSV en sla op als: `data/bol-offers.csv`

De CSV moet minimaal de kolommen `ean` en `offerId` bevatten. Zie `data/bol-offers.example.csv` voor het format.

**Tip:** Update dit bestand regelmatig als je nieuwe producten toevoegt op Bol.com.

## Automatisch draaien (Cron)

### macOS/Linux

```bash
crontab -e
```

Voeg toe (elke 15 minuten):

```
*/15 * * * * cd /pad/naar/bol-shopify-sync && /usr/local/bin/node index.js >> /var/log/bol-sync.log 2>&1
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task > "Bol Shopify Sync"
3. Trigger: Daily, repeat every 15 minutes
4. Action: Start program > `node.exe` met argument pad naar `index.js`

## Werking

### Flow per order

1. Haal Bol.com order op
2. Zoek klant in Shopify (op naam)
   - Niet gevonden? → Maak nieuwe klant aan
3. Per order item:
   - Zoek product op EAN in Shopify
   - Vergelijk prijzen
4. Maak draft order aan met:
   - Klant koppeling
   - Producten
   - Prijsverschil afhandeling
   - Tag "bol"
   - Metafield met Bol order ID

### Prijsverschil afhandeling

| Situatie | Actie |
|----------|-------|
| Bol duurder | Extra line item "Bol Prijsverschil" toegevoegd |
| Bol goedkoper | Korting "korting bol" toegepast |

## Bestanden

```
bol-shopify-sync/
├── index.js              # Entry point order sync
├── sync-stock.js         # Entry point stock sync
├── src/
│   ├── bol-api.js        # Bol.com API wrapper
│   ├── shopify-api.js    # Shopify GraphQL wrapper
│   ├── order-tracker.js  # Tracking verwerkte orders
│   ├── sync.js           # Order synchronisatie logica
│   └── stock-sync.js     # Stock synchronisatie logica
├── data/
│   ├── processed-orders.json  # Verwerkte order IDs
│   ├── bol-offers.csv         # Bol offers mapping (handmatig)
│   └── bol-offers.example.csv # Voorbeeld format
├── .env                  # Configuratie (niet in git)
└── .env.example          # Configuratie template
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

## License

MIT — see [LICENSE](LICENSE) for details.
