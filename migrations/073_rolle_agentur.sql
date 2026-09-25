-- Die Rolle "agentur" auch in der Datenbank erlauben (Florian, 23.09.2026).
--
-- Der Einladungslink war da, die Seite war da, nur die Regel an der
-- Benutzertabelle kannte die Rolle nicht. Wer sich über den Link
-- eintragen wollte, lief deshalb in einen Serverfehler. Genau dafür ist
-- die Regel da, sie war nur nicht nachgezogen.

alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk', 'agentur', 'buchhaltung'));
