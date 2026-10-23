-- Drei Punkte fuer die Foyer-Checkliste (Florian, 23.10.2026).
--
-- 1. Der Fernseher oben auf der Eventgalerie. Er soll laufen, solange
--    die Menuegaeste essen, und zwar von Anfang an: "direkt zu Beginn
--    ca. 17:30 uhr spaetestens oben der TV auf der Eventgalerie
--    eingeschaltet wird, sollten wir Gaeste fuers Menue haben".
--    Der Fernseher im Foyer steht schon weiter oben in der Liste, der
--    hier ist ein anderer.
--
-- 2. und 3. Auffuellen in beiden Haelften. Kuehlschraenke standen bisher
--    nur in der ersten Haelfte, Souvenirglaeser nur in der zweiten.
--    "am besten waehrend erster und zweiter haelfte". Jetzt steht beides
--    in beiden Haelften; der Kuehlschrank in Flos Umkleide bleibt, wo er
--    war, der wird vorher und in der zweiten Haelfte gemacht.
--
-- Doppelt eingetragen wird nichts: Jeder Punkt kommt nur, wenn er nicht
-- schon mit demselben Wortlaut in derselben Liste steht.

begin;

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foyer', 'foyer_vor',
       'Fernseher oben auf der Eventgalerie einschalten, spätestens 17:30 Uhr, wenn Menügäste da sind. Er läuft während des Essens.',
       26
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and text like 'Fernseher oben auf der Eventgalerie%');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foyer', 'foyer_akt1', 'Souvenirgläser auffüllen', 25
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and bereich = 'foyer_akt1' and text = 'Souvenirgläser auffüllen');

insert into showcheck_punkt (liste, bereich, text, reihenfolge)
select 'foyer', 'foyer_akt2', 'Kühlschränke und Theken auffüllen, wenn nötig', 15
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and bereich = 'foyer_akt2'
      and text = 'Kühlschränke und Theken auffüllen, wenn nötig');

commit;
