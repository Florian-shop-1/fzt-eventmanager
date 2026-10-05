-- Geteilte Zugaenge fuer Foyer und Show.
--
-- Am Abend steht ein Tablet im Foyer und eines hinter der Buehne. Dort
-- soll sich niemand mit seiner Mailadresse anmelden, sondern einfach als
-- "Foyer" oder "Show" (Florian, 05.10.2026).
--
-- Deshalb zwei Dinge: ein Anmeldename statt der Mailadresse, und ein
-- Kennzeichen, dass dieser Zugang niemandem persoenlich gehoert. Am
-- Kennzeichen haengt alles Weitere: kein Stempeln, kein Personalbogen,
-- keine Erinnerungen, kein Dienstplan, und nur die Seiten, die am Abend
-- wirklich gebraucht werden.
alter table benutzer add column if not exists benutzername text;
alter table benutzer add column if not exists geteilt boolean not null default false;

create unique index if not exists benutzer_benutzername_idx
  on benutzer (lower(benutzername)) where benutzername is not null;
