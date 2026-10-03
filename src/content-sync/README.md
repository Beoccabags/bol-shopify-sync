# Content-sync: titels, beschrijvingen en attributen naar bol.com

Herschrijft de productcontent van de 52 Beocca-EAN's op bol.com in NL en FR via de
Retailer API v10 (`POST /retailer/content/products`). Eerste run: 3 oktober 2026.

## Waarom en waarop gebaseerd
- `insights/product-ranks` liet zien dat de producten vrijwel geen organische zoekvertoningen
  kregen (3 gesponsorde posities rond rang 60 tot 90, verder niets).
- `insights/search-terms` (bol's eigen zoekvolumes, 12 maanden) bepaalde de woordkeuze:
  laptoptas 83k, schoudertas 36k, weekendtas 28k, laptoptas dames 25k, crossbody tas dames 23k,
  rugzak dames 22k, toilettas heren 19k, rugzak heren 16k, duffel bag 11k, leren riem heren 5k.
  FR-volumes op bol zijn klein (sac bandoulière femme 938, trousse de toilette homme 191).
- Feiten komen uitsluitend uit Shopify (beschrijving, `specs.*`, `custom.*`, `amazon.*`) plus
  visuele controle van de foto's. Zie de kop van `copy.js` voor wat bewust is weggelaten.

## Volgorde
```bash
node ../image-sync/fetch-shopify.js   # EAN-lijst (shopify-products.json)
node fetch-shopify-full.js            # feitenbron: shopify-full.json
node fetch-bol-content.js             # huidige bol-content NL+FR = backup (bol-content-current.json)
node search-terms.js                  # zoekvolumes + gerelateerde termen (search-terms.json)
node product-ranks.js 2026-09-30      # huidige rangen per EAN (product-ranks.json)
node build-plan.js                    # copy.js + facts -> content-plan.json (met validatie)
node build-review.js [pad.html]       # controlepagina oud vs nieuw
node push-content.js [--only EAN] [--lang nl|fr]   # hervatbaar, push-results.json
node verify-content.js status         # process-status (SUCCESS = aangenomen)
node verify-content.js reports        # na >= 1 uur: upload-report per attribuut
```

## Regels van bol die hier tellen
- `language`: `nl` (NL + Vlaanderen) en `fr` (Frankrijk + Wallonië). `nl-BE`/`fr-BE` alleen voor
  gerichte afwijkingen.
- Deel-updates zijn toegestaan: alleen de meegestuurde attributen veranderen. Titel heet in de
  upload `Name`, in de catalogus `Title`.
- Beschrijving: alleen `p`, `b`, `br`, `h3`, `ul`, `ol`, `li`, `strong`; richtlijn max 3000 tekens,
  jij-vorm, geen "actie"/"aanbieding".
- Titelrichtlijn: `[Merk] [Model] - [Producttype] - [Kenmerk] - [Kenmerk]`, gemiddeld 70 tekens,
  max 250. Concurrenten zitten op 110 tot 170; wij op 110 tot 190.
- Lijstwaarden (lov) per chunk staan in het datamodel:
  `https://productdatamodel.s-bol.com/v10/datamodel_v10_{nl,fr}.json` (dagelijks ververst).
- `processStatus SUCCESS` zegt alleen dat de inzending is aangenomen. Het echte oordeel staat in
  het upload-report (`uploadId` = `entityId` uit de process-status), meestal na een uur.
  `DECLINED / REJECTED "The system has opted for the product information of others"` betekent dat
  bol andermans content verkiest.

## Terugdraaien
`bol-content-current.json` bevat de volledige content van vóór de run (NL en FR). Een rollback is
een upload met `Name`, `Description` en `Colour` uit dat bestand.

## Bekende twijfelpunten in de brondata (niet in de nieuwe teksten gezet)
- Literinhoud: Shopify en bol spreken elkaar tegen bij Milo (55 vs 50) en Lorne (geen vs 11), en de
  opgegeven liters van de rugzakken liggen ver boven breedte x hoogte x diepte.
- Cleo: hoogte 25 cm (Shopify) vs 38 cm (bol).
- Lilith: Shopify noemt 13 inch laptop, bol-attribuut zegt geen laptopvak.
- Binnenvoering: Shopify/bol zeggen katoen of leer, de Kaufland-FR-teksten polyester.
- Argyle Bruin heeft SKU PM-CO-01 (cognac); Shopify noemt de variant Bruin, dat is aangehouden.
- Finn: Shopify-tekst zegt "volledig leer", maar het is leer met canvas (foto en bol-titel).
