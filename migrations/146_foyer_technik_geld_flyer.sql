-- Fernseher, Tablet, Kartenlesegerät, Geldbeutel, Flyerdisplays.
--
-- Die ersten vier aus Veronica Frangellas Vorschlägen vom 05.10.2026,
-- von Florian freigegeben. Geräte, die geladen werden müssen, gehören
-- auf die Liste: Ein leeres Tablet merkt man erst, wenn ein Gast davor
-- steht.
--
-- Das Geldzählen bekommt keine eigene Zeile, sondern steht beim Punkt,
-- bei dem man ohnehin den Geldbeutel in der Hand hat.
--
-- Beim Flyerpunkt stand eine Schätzung ("mindestens 3 auf der Bar").
-- Florian hat nachgezählt: sieben Displays, und jedes hat seinen Platz.

-- Fernseher: ganz am Anfang, zusammen mit Licht und Theken.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_vor', 'Fernseher einschalten und auf den USB-Stick stellen', 25, 'foyer'
 where not exists (
   select 1 from showcheck_punkt p where p.liste = 'foyer' and p.text like 'Fernseher einschalten%'
 );

-- Tablet laden: in der ersten Hälfte und noch einmal nach der Show,
-- zusammen mit dem Kartenlesegerät.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_akt1', 'Tablet laden', 70, 'foyer'
 where not exists (
   select 1 from showcheck_punkt p
    where p.liste = 'foyer' and p.bereich = 'foyer_akt1' and p.text = 'Tablet laden'
 );

insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_ende', 'Tablet und Kartenlesegerät zum Laden anstecken', 75, 'foyer'
 where not exists (
   select 1 from showcheck_punkt p where p.liste = 'foyer' and p.text like 'Tablet und Kartenlesegerät%'
 );

-- Geld zählen beim Geldholen, nicht als eigener Punkt.
update showcheck_punkt
   set text = 'Geld holen und zählen, 100 Euro müssen im Geldbeutel sein, Kassensystem starten'
 where liste = 'foyer' and text = 'Geld holen, Kassensystem starten';

-- Sieben Displays, nachgezählt.
update showcheck_punkt
   set text = 'Flyerständer prüfen: 7 Displays mit FZT-Flyern, 4 auf der Bar, 2 bei der Garderobe, 1 beim Merch-Shop'
 where liste = 'foyer' and text like 'Flyerständer prüfen%';
