-- Geschenke für Gäste, die im Warenkorb stehen geblieben sind
-- (Florian, 23.09.2026).
--
-- Niemand geht leer aus: Wer aus der wöchentlichen Ziehung das
-- Getränkepaket bekommt, bekommt das VIP-Bändchen Silber. Alle anderen
-- bekommen ein Souvenirglas, bei Familienshows einen erscheinenden
-- Zauberstab für jedes Kind.
--
-- Bewusst KEIN Produkt in Ditix: Das Geschenk wird nicht gebucht, es ist
-- auf den Namen hinterlegt. Der Gast meldet sich an der Magic-Bar, das
-- Foyer sieht es hier und hakt es ab. Damit bleibt der Warenkorb sauber
-- und niemand muss ein 0-Euro-Produkt pflegen.

create table if not exists abbruch_geschenk (
  id            uuid primary key default gen_random_uuid(),
  -- Die abgebrochene Buchung, aus der das Versprechen entstand.
  buchung_id    uuid references shop_buchung (id) on delete set null,
  email         text not null,
  name          text not null default '',
  -- baendchen, glas, zauberstab
  art           text not null check (art in ('baendchen', 'glas', 'zauberstab')),
  anzahl        int  not null default 1 check (anzahl > 0),
  versprochen_am timestamptz not null default now(),
  -- Eingelöst im Foyer, an der Magic-Bar.
  eingeloest_am  timestamptz,
  eingeloest_von text,
  notiz          text not null default ''
);

create index if not exists abbruch_geschenk_offen on abbruch_geschenk (eingeloest_am, versprochen_am);
create index if not exists abbruch_geschenk_email on abbruch_geschenk (lower(email));
