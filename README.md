# Gatduell Umeå

En fristående Gatduell byggd från grunden med den fungerande gatlogiken från Orten 2.0 som grund.

## Spelet

- Endast Umeå
- 2 spelare på samma enhet
- Först till 3 rundvinster
- Hard: direkt anslutande gata
- Medium: högst 2 steg
- Easy: högst 3 steg
- Valbar tidsgräns: av, 10, 15, 20, 30, 45 eller 60 sekunder
- Umeås gatunät hämtas från Umeå Open Data / NVDB
- Rondeller och små trafiköar hanteras av samma gatgraf-princip som i Orten 2.0

## Kartan

Leaflet används direkt utan adapterlager. Kartan skapas först när en match startar och skapas då redan i fullskärmsläget.

- Ett finger: panorera
- Två fingrar: pinch-zoom
- Tidigare spelade gator: turkos
- Aktuell gata: orange med vit kant
- Svarsfältet ligger alltid i nederkant
- Knappen ◎ centrerar åter på aktuell gata

## Arkitektur

Den körande appen består av:

- `index.html`
- `styles.css`
- `engine.js`
- `app.js`

Gamla konto-, ranking-, premium-, flerstads- och MapLibre-lager är borttagna.

## Test

```bash
npm test
npm run check
```

Testerna omfattar bland annat direkta gatukorsningar, rondellfallet Hissjövägen ↔ Östra Kyrkogatan, svårighetsgrader och att den rena appen inte återinför gamla sidomoduler.
