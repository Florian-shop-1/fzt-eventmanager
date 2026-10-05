-- Zwei Punkte mehr auf der Foyer-Liste, vor der Öffnung.
--
-- "ob mindestens 3 Flyerständer von uns auf der Bar stehen und zwei auf
-- der Garderobe. Auf jedem Stehtisch steht ein Kärtchen für
-- Firmenevents" (Florian, 05.10.2026). Werbung in eigener Sache: Sie
-- gehört zum Aufbau wie das Popcorn.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select x.bereich, x.text, x.reihenfolge, 'foyer'
  from (values
    ('foyer_vor', 'Flyerständer prüfen: mindestens 3 auf der Bar, 2 auf der Garderobe', 85),
    ('foyer_vor', 'Auf jedem Stehtisch liegt ein Kärtchen für Firmenevents',            86)
  ) as x(bereich, text, reihenfolge)
 where not exists (
   select 1 from showcheck_punkt p where p.liste = 'foyer' and p.text like 'Flyerständer%'
 );
