-- Toiletten kontrollieren, sobald der Einlass durch ist.
--
-- Gehört in die erste Hälfte, also zwischen 20 und 21 Uhr: Vorher steht
-- das Foyer voller Gäste, nachher ist die Pause da und es ist zu spät
-- (Florian, 07.10.2026). Bei einer früheren Show verschiebt sich der
-- Abschnitt mit, wie alle anderen auch.
--
-- Der Punkt steht bewusst als erster im Abschnitt: Was nach dem Einlass
-- zuerst drankommt, soll auch zuerst dastehen.
--
-- Das Klopapier am Waschbecken ist kein Nebensatz, sondern der Grund,
-- warum der Punkt so ausführlich ist: Dort landet es immer wieder, und
-- dort gehört es nicht hin.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_akt1',
       'Toiletten kontrollieren, sobald der Einlass durch ist: Klopapier da? Handtücher voll? Sauberkeit in Ordnung? Wichtig: kein Klopapier beim Waschbecken',
       5,
       'foyer'
 where not exists (
   select 1 from showcheck_punkt p
    where p.liste = 'foyer' and p.text like 'Toiletten kontrollieren%'
 );
