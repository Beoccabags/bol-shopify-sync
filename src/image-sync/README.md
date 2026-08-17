# Afbeeldingen-sync: Shopify → bol.com

Zet de productfoto's uit Shopify op de bijbehorende bol-listings, per variant.
Draait op de bol Retailer API v10 (`POST /content/products`).

## Waarom dit werkt zonder de rest van de content te raken
In een content-upload is **alleen de EAN verplicht**. Er gaan dus uitsluitend
een EAN plus een `assets`-lijst mee — titels, beschrijvingen en GPSR-velden
blijven onaangeroerd.

## Volgorde
```bash
node fetch-shopify.js    # alle producten + varianten + media  -> shopify-products.json
node map-images.js       # koppelt afbeeldingen aan varianten  -> variant-images.json
node chunks.js           # bol-categorie (chunk) per EAN       -> ean-chunks.json
node assign-labels.js    # labelt elke foto per categorie       -> upload-plan.json
node thumbs.js           # thumbnails voor de controlepagina    -> thumbs.json
node build-page.js       # visuele controlepagina               -> fotocontrole.html
python3 sheets.py        # contactvellen voor de kleurcontrole   -> sheet-N.png
node push.js             # verstuurt naar bol                   -> push-results.json
node verify.js           # process-status per inzending         -> verify-status.json
node reports.js          # inhoudelijk upload-rapport           -> upload-reports.json
```
Draai `build-page.js` en bekijk de pagina **voordat** je `push.js` draait.
Draai daarnaast `sheets.py` en bekijk de contactvellen met de Read-tool: de kleurnaam in
Shopify heeft eerder omgekeerd gestaan ten opzichte van het beeld, en dat is alleen
visueel te vinden.

## Hoe foto's aan varianten worden gekoppeld
Shopify koppelt maar één afbeelding per variant, dus de rest wordt afgeleid:

1. **Expliciet** — de variantnaam staat in de bestandsnaam of alt-tekst
   (`beocca-rugzak-cleo-suede-zwart-vooraanzicht.jpg`). Langste match wint,
   zodat "suede zwart" niet botst met "glad zwart".
2. **Blok-heuristiek** — anders hoort een foto bij de variant wiens
   hoofdafbeelding er in de mediavolgorde het laatst vóór staat.
3. **Per kleur gegroepeerd** — maatvarianten ("Cognac / 95cm") delen de
   foto's van hun kleur.

## Labels
bol bepaalt de carrouselvolgorde op basis van labels, en de toegestane set
verschilt **per categorie**. Die set komt uit bol's eigen datamodel
(`datamodel_v10_nl.json`, dagelijks ververst) — niet uit een vaste lijst.
Per variant krijgt precies één foto `FRONT`; dat wordt de hoofdafbeelding.
Een label dat in een categorie niet bestaat, valt terug op `OTHER`.

## Valkuilen
- **`processStatusId` = SUCCESS zegt niets inhoudelijks.** Dat betekent enkel
  dat de inzending is aangenomen; een onzin-EAN met een onzin-label levert óók
  SUCCESS op. De echte uitslag staat in `reports.js` (upload-rapport), per
  afbeelding, en die verwerking duurt.
- **EAN's kunnen afwijken.** De Cleo Suede Zwart staat op bol onder
  `7440853174146` en in Shopify onder `8721398221502`; zie `EAN_OVERRIDE`
  in `chunks.js`.
- **Rate limits.** bol geeft snel 429; alle scripts wachten en proberen opnieuw.
  `push.js` en `chunks.js` slaan tussentijds op en kunnen hervat worden.
