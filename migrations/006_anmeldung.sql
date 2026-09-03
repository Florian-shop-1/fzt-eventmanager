-- Anmeldung für das Team.
--
-- Rollen:
--   chef    Darf alles, auch Benutzer anlegen. Florian.
--   team    Darf alles außer Benutzerverwaltung. Kevin, Sarah, das
--           allgemeine Postfach.
--   gastro  Sieht nur Funktionsheet und Küchenblatt. Keine Preise, keine
--           Kundendaten, keine Zahlungen. Für Osman und sein Team.
--
-- Passwörter werden niemals im Klartext gespeichert, sondern als Prüfsumme
-- mit zufälligem Zusatz (scrypt). Aus der Prüfsumme lässt sich das Passwort
-- nicht zurückrechnen.

alter table benutzer add column if not exists passwort_hash text;
alter table benutzer add column if not exists passwort_geaendert_am timestamptz;
alter table benutzer add column if not exists letzter_login timestamptz;
alter table benutzer add column if not exists muss_passwort_aendern boolean not null default true;

-- Rolle absichern: nur die drei bekannten Werte sind erlaubt.
alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro'));

-- Mailadressen immer klein vergleichen, damit sich niemand doppelt anlegt.
create unique index if not exists benutzer_email_eindeutig on benutzer (lower(email));

comment on column benutzer.muss_passwort_aendern is
  'true nach dem Anlegen: der Benutzer wird beim ersten Anmelden zum Ändern aufgefordert.';
