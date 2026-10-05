-- Nach der Pause bleibt nur eine Person im Foyer.
--
-- "hier wäre gut die info, dass nach der pause bitte nur ein mitarbeiter
-- bleibt. wenn festangestellte arbeiten, geht der Nebenjobber nach hause"
-- (Florian, 05.10.2026).
--
-- Steht als eigener Punkt in der Pause, denn genau dann wird es
-- entschieden: Wer geht, soll ausstempeln und nicht einfach verschwinden.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'foyer_pause',
       'Nach der Pause bleibt nur eine Person im Foyer: Ist jemand fest angestellt da, bleibt er, der Nebenjobber stempelt aus und geht nach Hause',
       20,
       'foyer'
 where not exists (
   select 1 from showcheck_punkt p
    where p.liste = 'foyer' and p.text like 'Nach der Pause bleibt nur eine Person%'
 );
