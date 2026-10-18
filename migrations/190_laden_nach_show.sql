-- Alles ans Ladekabel, bevor das Licht ausgeht (Florian, 18.10.2026).
--
-- "Show nach Show: hängt das iPad für Einlass an der Garderobe beim
-- Laden? Foyer: iPads laden. Bei Show auch iPhone zum Laden hängen für
-- nach der Show."
--
-- Ein leeres Gerät merkt niemand abends, sondern am nächsten Tag beim
-- Einlass. Deshalb drei Punkte dort, wo das Gerät am Ende des Abends
-- liegt.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'nach_show', 'Hängt das iPad für den Einlass an der Garderobe am Ladekabel?', 125, 'show'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'show' and bereich = 'nach_show' and text like '%iPad für den Einlass%'
 );

insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'nach_show', 'Show-iPhone zum Laden hängen', 126, 'show'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'show' and bereich = 'nach_show' and text like '%iPhone zum Laden%'
 );

-- Im Foyer hing bisher nur ein Tablet am Kabel. Es sind mehrere.
update showcheck_punkt
   set text = 'Alle iPads und das Kartenlesegerät zum Laden anstecken'
 where liste = 'foyer' and bereich = 'foyer_ende'
   and text = 'Tablet und Kartenlesegerät zum Laden anstecken';
