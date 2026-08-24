# Gatduell

Gatduell är ett snabbt lokalkännedomsspel där två spelare turas om att ange gator som hänger ihop. Umeå ingår gratis och arkitekturen stödjer premiumstäder, konto och global ranking.

## Spelfunktioner

- 2 spelare på samma enhet
- först till 3 rundvinster
- Hard: direkt anslutande gata
- Medium: högst 2 steg
- Easy: högst 3 steg
- valbar tidsgräns
- karta som följer aktuell gata
- lokal Hall of Fame och delningsbara resultat

## Gatduell Cities

- Umeå — gratis, Umeå kommuns/NVDB:s öppna data
- Stockholm — Premium, OpenStreetMap via Overpass
- Göteborg — Premium, OpenStreetMap via Overpass
- Malmö — Premium, OpenStreetMap via Overpass

## Konto, ranking och Premium

Frontendlagret finns i `backend.js`. Utan backend fungerar spelet fortfarande i gästläge. För att aktivera konto och global ranking:

1. Skapa ett Supabase-projekt.
2. Kör `supabase/schema.sql`.
3. Lägg projektets URL och publishable/anon key i `config.js`.
4. Lägg GitHub Pages-adressen som Auth Site URL/Redirect URL i Supabase.
5. Koppla en betrodd checkout/webhook som sätter `profiles.is_premium=true` och lägg checkout-länken i `config.js`.

**Lägg aldrig en Supabase service-role key i GitHub Pages eller annan frontendkod.**

## Test

```bash
npm test
npm run check
```

Testerna omfattar gatkorsningar, rondellfallet Hissjövägen ↔ Östra Kyrkogatan, svårighetsgrader samt stadskatalog/Overpass-konvertering.
