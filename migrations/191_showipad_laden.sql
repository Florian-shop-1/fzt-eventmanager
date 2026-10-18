-- Das Show-iPad von Einlass und Gong wird vergessen (Florian, 18.10.2026).
--
-- "sie vergessen beim Showteam das Show-iPad vom Einlass und Gong zu
-- laden, es liegt an der Garderobe."
--
-- Deshalb nennt der Punkt beide Aufgaben des Geräts und steht farbig
-- hervorgehoben in der Liste: Ein leeres iPad merkt niemand abends,
-- sondern am nächsten Tag beim Einlass.
--
-- Das Show-iPhone bleibt der schon vorhandene Punkt "Assistentenhandy an
-- Ladegerät"; der zweite Punkt dafür war eine Doppelung und fliegt
-- wieder raus.
delete from showcheck_punkt
 where liste = 'show' and bereich = 'nach_show' and text = 'Show-iPhone zum Laden hängen';

update showcheck_punkt
   set text = 'iPad für Einlass und Gong an der Garderobe ans Ladekabel hängen',
       hervorgehoben = true
 where liste = 'show' and bereich = 'nach_show' and text like '%iPad für den Einlass%';
