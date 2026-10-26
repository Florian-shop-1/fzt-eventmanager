-- Neue Punkte für die FOH-Checkliste (Leeven über Florian, 25.10.2026).
--
-- Aus der Praxis am Pult, nicht am Schreibtisch ausgedacht. Vier gehören
-- in die Pause, drei an das Ende des Abends:
--
--   Pause      Brandmeldeanlage neu starten, LED runter, der nächste
--              Pausen-Cue mit Vorhang, Headset holen.
--   Nach Show  Bodennebel leeren, Hazer aus, Hosentaschen leeren.
--
-- Der Gong vom iPad stand schon in der Liste ("Zweimal Gong vom
-- Show-iPad", Pause), deshalb kommt er nicht noch einmal dazu.
--
-- Doppelt eingetragen wird nichts: Jeder Punkt kommt nur, wenn er nicht
-- schon mit demselben Wortlaut in derselben Liste steht.
begin;

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'pause', 'Brandmeldeanlage neu starten', 5
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text = 'Brandmeldeanlage neu starten');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'pause', 'LED runter', 35
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text = 'LED runter');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'pause', 'Nächsten Pausen-Cue setzen, Vorhang nicht vergessen', 45
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text like 'Nächsten Pausen-Cue%');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'pause', 'Headset holen', 55
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text = 'Headset holen');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'nach_show', 'Bodennebel leeren', 5
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text = 'Bodennebel leeren');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'nach_show', 'Hazer aus', 6
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text = 'Hazer aus');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foh', 'nach_show', 'Hosentaschen leeren', 40
 where not exists (
   select 1 from showcheck_punkt where liste = 'foh' and text = 'Hosentaschen leeren');

commit;
