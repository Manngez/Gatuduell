# Supabase för Gatduell

1. Skapa ett Supabase-projekt.
2. Kör `schema.sql` i SQL Editor.
3. Lägg projektets URL och **publishable/anon key** i `config.js`.
4. Lägg GitHub Pages-adressen i Supabase Auth → URL Configuration som Site URL/Redirect URL.
5. Premiumstatus (`profiles.is_premium`) ska bara sättas av en betrodd betalnings-backend/webhook med service-role key.

## Säkerhetsnotering

Frontend kan aldrig vara en pålitlig anti-cheat-motor. Rankingfunktionen är lämplig för vanlig community-ranking, men pristävlingar eller värdefulla belöningar bör senare flytta matchvalidering till en betrodd server/edge function.
