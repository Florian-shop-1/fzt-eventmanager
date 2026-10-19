-- Kühlschrank und Souvenirgläser in die zweite Hälfte, nicht in die Pause.
--
-- "bei Checkliste Foyer für die zweite Hälfte Kühlschrank Flo-Umkleide
-- hinter Bar auffüllen dazu und weiterer Punkt: Souvenirgläser
-- auffüllen" (Florian, 17.10.2026). Eingetragen waren beide unter
-- "Pause", also 21:00 bis 21:20 Uhr. Das sind die zwanzig Minuten, in
-- denen alle Gäste gleichzeitig an der Bar stehen; dort ist niemand
-- frei. Gemeint war die zweite Hälfte ab 21:20 Uhr, wenn die Show läuft
-- und im Foyer Ruhe ist.
--
-- Der Kühlschrank stand ausserdem doppelt: in der zweiten Hälfte schon
-- als "Flos Kühlschrank auffüllen". Der alte Punkt bekommt den
-- genaueren Text, der neue aus der Pause fällt weg.

update showcheck_punkt
   set text = 'Kühlschrank in Flos Umkleide hinter der Bar auffüllen'
 where liste = 'foyer' and bereich = 'foyer_akt2' and text = 'Flos Kühlschrank auffüllen';

delete from showcheck_punkt
 where liste = 'foyer' and bereich = 'foyer_pause'
   and text = 'Kühlschrank in Flos Umkleide hinter der Bar auffüllen';

update showcheck_punkt
   set bereich = 'foyer_akt2', reihenfolge = 25
 where liste = 'foyer' and bereich = 'foyer_pause' and text = 'Souvenirgläser auffüllen';

-- Vor der Show derselbe Kühlschrank, derselbe genauere Text.
update showcheck_punkt
   set text = 'Kühlschrank in Flos Umkleide hinter der Bar auffüllen'
 where liste = 'foyer' and bereich = 'foyer_vor' and text = 'Flos Kühlschrank auffüllen';
