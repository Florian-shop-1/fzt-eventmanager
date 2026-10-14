-- Welche Anfrage schon gemeldet wurde (Florian, 14.10.2026).
--
-- Die Mail an tickets@ kam bisher aus Make und verlinkte in die
-- Google-Tabelle. Künftig meldet der Eventmanager selbst und verlinkt
-- auf die Anfrage bei sich: "wir wollen uns von den google tabellen
-- lösen."
--
-- Der Schlüssel ist derselbe wie in der Anfragenliste: aus Datum,
-- Adresse und Name gebildet, siehe lib/shop/leads.ts.
create table if not exists anfrage_gemeldet (
  schluessel  text primary key,
  gemeldet_am timestamptz not null default now()
);
