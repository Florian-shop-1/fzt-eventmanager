-- Ein Video zum Checklistenpunkt.
--
-- "ich habe das video Licht einschalten im Foyer genannt, bitte linken
-- hinter dem To-Do punkt" (Florian, 11.10.2026). Wer den Handgriff zum
-- ersten Mal macht, soll ihn sehen koennen, ohne in Tipps und Tricks zu
-- suchen.
--
-- Verwiesen wird auf den Tipp, nicht auf die Videodatei: Wird das Video
-- ersetzt, bleibt der Verweis gueltig.
alter table showcheck_punkt add column if not exists tipp_id uuid references tipp (id) on delete set null;

comment on column showcheck_punkt.tipp_id is
  'Optionales Video aus Tipps und Tricks, das diesen Handgriff zeigt.';

-- Die beiden, die es schon gibt.
update showcheck_punkt
   set tipp_id = (select id from tipp where titel = 'Licht einschalten im Foyer' limit 1)
 where liste = 'foyer' and text like 'Licht einschalten%';

update showcheck_punkt
   set tipp_id = (select id from tipp where titel = 'Parkplätze drucken' limit 1)
 where liste = 'foyer' and text like 'Parkplatzschilder drucken%';
