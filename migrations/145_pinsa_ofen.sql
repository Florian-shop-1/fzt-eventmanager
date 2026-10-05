-- Den Pinsa-Ofen rechtzeitig anschalten.
--
-- Vorschlag von Veronica Frangella über "Fehlt was auf der Checkliste?"
-- (05.10.2026): "Pinsa-Ofen ca. 10-15 Minuten vor Gebrauch vorheizen.
-- Wichtig: Der Ofen läuft nur, wenn der Timer eingestellt ist."
--
-- Florian hat daraus die Uhrzeit gemacht: Die Pinsas sind für die Pause
-- gedacht, also gehört der Ofen schon 30 Minuten vorher an. Deshalb
-- steht der Punkt in der ersten Hälfte und nicht in der Pause: In der
-- Pause wäre es zu spät, da steht der Service bei den Gästen.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_akt1',
       'Pinsa-Ofen anschalten, 30 Minuten vor der Pause: Er heizt 10 bis 15 Minuten vor und läuft nur mit eingestelltem Timer',
       60,
       'foyer'
 where not exists (
   select 1 from showcheck_punkt p
    where p.liste = 'foyer' and p.text like 'Pinsa-Ofen anschalten%'
 );
