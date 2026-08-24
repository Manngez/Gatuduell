# Gatduell Umeå

Ett fristående lokalt geografispel byggt från Gatduell-idén i Orten 2.0.

Två spelare turas om att ange en gata i Umeå som ligger rätt i gatunätet från den aktuella gatan. Fel svar, återanvänd gata eller (om vald) utgången tid förlorar rundan. Först till tre rundvinster vinner matchen.

## Spellgen

- **Hard** – gatan måste vara direkt anslutande.
- **Medium** – direkt anslutning eller via en mellanliggande gata, max 2 steg.
- **Easy** – max 3 steg.
- Tidsgräns per tur: ingen, 10, 15, 20, 30, 45 eller 60 sekunder.
- Rondeller och små trafiköar hanteras med en särskild anslutningslogik så att gatarmar som hör till samma korsning kan kopplas ihop korrekt.

## Data

Spelet hämtar Umeås vägdata från OpenDataUmea-datasetet `roads_umea` när sidan startas. Portalen beskriver datasetet som ett exempel från Nationella vägdatabasen och hänvisar till Trafikverket för aktuell vägdata.

## Kör lokalt

Eftersom webbläsaren hämtar data via `fetch` bör spelet köras via en enkel lokal webbserver i stället för genom att dubbelklicka på `index.html`.

```bash
python -m http.server 8080
```

Öppna sedan `http://localhost:8080`.

## GitHub Pages

Repot innehåller ett Pages-workflow. Aktivera **GitHub Pages → Source: GitHub Actions** i repository-inställningarna om det behövs.
