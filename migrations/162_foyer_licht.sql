-- Licht im Foyer, genauer gesagt (Florian, 11.10.2026).
--
-- "Lichter an" war zu knapp. Vergessen wurden regelmäßig die Streifen
-- auf der Eventgalerie, weil dort an manchen Abenden niemand sitzt, und
-- die Anlage über der Haupteingangstür, deren Schalter an einer Stelle
-- sitzt, die man kennen muss.
update showcheck_punkt
   set text = 'Licht einschalten, auch die LED-Streifen auf der Eventgalerie, selbst wenn dort niemand sitzt, dazu die LED oben am Fenster und die Garderobe'
 where liste = 'foyer' and text = 'Lichter an';

insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_vor',
       'Anlage für Licht und Ton über der Haupteingangstür einschalten: Der Schalter sitzt am Mehrfachstecker hinter der Pflanze beim Merch-Stand',
       25,
       'foyer'
 where not exists (
   select 1 from showcheck_punkt p where p.liste = 'foyer' and p.text like 'Anlage für Licht und Ton%'
 );
