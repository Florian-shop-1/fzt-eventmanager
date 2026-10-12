-- Eine Rolle für Nebenjobber ohne Dienst im Haus (Florian, 12.10.2026).
--
-- Konkret: jemand, der nur an den Videos für die Show arbeitet. Er
-- braucht einen Zugang, den Personalbogen und den Arbeitsvertrag, mehr
-- nicht. Keine Stempeluhr, kein Dienstplan, kein Saal.
alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk', 'agentur',
                   'buchhaltung', 'reinigung', 'nebenjob'));
