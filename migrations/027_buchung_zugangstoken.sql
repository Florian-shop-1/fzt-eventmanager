-- Zugangsschlüssel für die Upgrade-Seite im Shop.
--
-- Eine Woche vor der Show bekommt der Gast eine Mail mit einem Link auf
-- shop.florianzimmertheater.de/upgrade/<schluessel>. Dort sieht er, was er
-- gebucht hat, und kann nachbuchen, was fehlt.
--
-- Warum ein eigener Schlüssel und nicht die cart_id:
-- Die cart_id ist unser Abgleichsschlüssel gegenüber Ditix, mit ihr fragen wir
-- den Zahlungsstand ab. Was in einer Mail steht, landet später in
-- Browserverläufen, Weiterleitungen und Screenshots. Ein eigener Schlüssel
-- lässt sich zurückziehen, ohne dass der Abgleich kaputtgeht.
--
-- gen_random_uuid() ohne Bindestriche: 32 Hexzeichen, rund 122 Bit Zufall.
-- Nicht erratbar, und es braucht keine zusätzliche Postgres-Erweiterung.

alter table shop_buchung
  add column if not exists zugang_token text;

-- Bestehende Zeilen nachträglich versorgen.
update shop_buchung
   set zugang_token = replace(gen_random_uuid()::text, '-', '')
 where zugang_token is null;

alter table shop_buchung
  alter column zugang_token set default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists shop_buchung_token on shop_buchung (zugang_token);
