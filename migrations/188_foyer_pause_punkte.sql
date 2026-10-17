-- Zwei Punkte für die zweite Hälfte im Foyer (Florian, 17.10.2026).
--
-- "bei Checkliste Foyer für die zweite Hälfte: Kühlschrank Flo-Umkleide
-- hinter Bar auffüllen, dazu: Souvenirgläser auffüllen."
--
-- Beides passiert, während die Show läuft: Dann ist Ruhe im Foyer, und
-- hinterher braucht es niemand mehr. Der Kühlschrank in der Umkleide ist
-- nicht derselbe wie der unter foyer_vor, dort geht es um den im Foyer.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_pause', 'Kühlschrank in Flos Umkleide hinter der Bar auffüllen', 30, 'foyer'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and bereich = 'foyer_pause' and text like '%Umkleide%'
 );

insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_pause', 'Souvenirgläser auffüllen', 40, 'foyer'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and bereich = 'foyer_pause' and text like '%Souvenirgl%'
 );
