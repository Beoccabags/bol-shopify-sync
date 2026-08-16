# Afbeeldingen-sync: Shopify → Amazon

Zet de Shopify-productfoto's op de Amazon-listings van Beocca, per SKU en per markt.
Gebruikt de Listings Items API (`PATCH /listings/2021-08-01/items/{seller}/{sku}`).

Werkt met `../image-sync/variant-images.json` — draai daar eerst
`fetch-shopify.js` en `map-images.js`.

## Volgorde
```bash
node fetch-listings.js      # alle SKU's per markt        -> listings.json
node build-plan.js          # koppelt SKU aan Shopify-variant -> amz-plan.json
node apply.js DE            # valideert én zet live, per markt
node verify-amz.js DE       # leest terug wat er werkelijk staat
```
Markten los draaien; `apply.js` slaat af wat al `live` staat, dus hervatten kan.

## Beeldvelden
`main_product_image_locator` plus `other_product_image_locator_1..8` — dus
**maximaal 9 foto's**. Staan er meer in Shopify, dan vallen de foto's onder
1000px als eerste af (die krijgen op Amazon toch geen zoom).

## Valkuilen
- **Elke patch wordt eerst in `VALIDATION_PREVIEW` gestuurd** en pas bij
  `VALID` live. Amazon hervalideert bij elke wijziging de héle listing, dus een
  beeldpatch kan stuklopen op velden die er al jaren niet in staan.
- **`ACCEPTED` betekent niet dat het is doorgevoerd.** Amazon verwerkt
  asynchroon en meldt niets als dat faalt. Draai daarom altijd `verify-amz.js`.
- **Een `delete`-op heeft tóch een `value` nodig**, met de marketplace-selector:
  `{op:'delete', path:'/attributes/other_..._4', value:[{marketplace_id: mpid}]}`.
  Zonder `value` (of met `value: []`) geeft Amazon 400 "Invalid empty value".
  Dat is nodig om oude beeldslots op te ruimen die de nieuwe set niet vult.
- **SKU's zijn seller-breed, niet per markt** — dezelfde SKU bestaat op DE, FR,
  NL en BE. De EAN staat echter lang niet overal ingevuld (NL 51, DE 4, FR/BE 0),
  dus de koppeling wordt uit alle markten samen opgebouwd.
- **Sommige EAN's wijken af van Shopify.** Milo, Finn en Lorne dragen op Amazon
  een `7440853…`-EAN; Cleo Glad zwart en Milo Cognac hebben er geen. Die staan
  handmatig in `OVERRIDE` in `build-plan.js`, geverifieerd op kleur + naam.
- **Parent-listings van variatiefamilies krijgen geen foto's** (19 stuks); die
  worden overgeslagen op `parentage_level=parent`.
- **Paginering van `searchListingsItems` is onbetrouwbaar** — ontdubbel op SKU
  en tel nooit uit de paginering af of iets geland is.

## Verifiëren
Amazon vervangt de ingestuurde URL door zijn eigen `m.media-amazon.com`-adres
zodra hij de foto heeft opgehaald. URL's vergelijken werkt dus niet. Gebruik:
```bash
node readback.js DE     # haalt op wat er live staat -> readback-DE.json
python3 phash.py DE     # vergelijkt op beeldinhoud (perceptuele hash)
```
Amazon verwerkt beelden asynchroon; direct na een patch staan er nog te weinig
en klopt de volgorde tijdelijk niet. Verifieer een half uur later opnieuw.

## Bekende blokkade op BE
38 van de 49 BE-listings weigeren élke patch met
`100720: Invalid language data provided ... for attributes Title / Bullet Point`.
Dat is een bestaand taalprobleem (BE accepteert uitsluitend `fr_BE`) en staat los
van de foto's; omdat Amazon bij elke wijziging de héle listing hervalideert,
blokkeert het ook een beeldpatch. Eerst de fr_BE-titels en bullets rechtzetten.
