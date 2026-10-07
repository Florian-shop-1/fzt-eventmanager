-- Die Rollenpruefung heisst anders, als 151 angenommen hat.
--
-- In 151 wurde "benutzer_rolle_check" angelegt, die bestehende Regel
-- heisst aber "benutzer_rolle_gueltig" (so haben es die Migrationen 006
-- bis 073 getauft). Damit galten beide, und die aeltere kannte die
-- Reinigung nicht: Der Zugang liess sich nicht anlegen.
--
-- Hier bleibt genau eine Regel stehen, unter dem Namen, den die
-- frueheren Migrationen verwenden.
alter table benutzer drop constraint if exists benutzer_rolle_check;
alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk', 'agentur', 'buchhaltung', 'reinigung'));
