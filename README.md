# Bol.com → Shopify Draft Orders Sync

Synchroniseert Bol.com orders automatisch naar Shopify draft orders.

## Features

- Haalt open FBR orders op van Bol.com
- Zoekt of maakt klanten aan in Shopify
- Matcht producten op EAN/barcode
- Handelt prijsverschillen af (duurder/goedkoper)
- Voorkomt dubbele verwerking via order tracking
- Voegt "bol" tag en marketplace bestelnummer toe

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
# Eenmalig uitvoeren
npm start

# Of direct
node index.js
```

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
├── index.js              # Entry point
├── src/
│   ├── bol-api.js        # Bol.com API wrapper
│   ├── shopify-api.js    # Shopify GraphQL wrapper
│   ├── order-tracker.js  # Tracking verwerkte orders
│   └── sync.js           # Synchronisatie logica
├── data/
│   └── processed-orders.json  # Verwerkte order IDs
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
