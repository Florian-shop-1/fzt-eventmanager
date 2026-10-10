-- Die Klimaanlage steht auf beiden Listen.
--
-- Am Pult wird sie ausgeschaltet, hinter der Bühne wird nachgesehen:
-- "Klima sollen auch die techniker der anderen liste auf dem zettel
-- haben (vor showbeginn), dann sieht man, dass sie aus ist" (Florian,
-- 10.10.2026).
--
-- Deshalb auf beiden Listen derselbe Satz. Wer zuerst hinkommt,
-- schaltet aus, der zweite bestätigt. Ein Haken, der zweimal gesetzt
-- wird, ist hier kein doppelter Weg, sondern die Kontrolle.
update showcheck_punkt
   set text = 'Klimaanlage ausschalten, beziehungsweise prüfen, ob sie aus ist'
 where liste = 'foh' and text like 'Klimaanlage%';

insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'vor_show', 'Klimaanlage ausschalten, beziehungsweise prüfen, ob sie aus ist', 330, 'show'
 where not exists (
   select 1 from showcheck_punkt p where p.liste = 'show' and p.text like 'Klimaanlage%'
 );
