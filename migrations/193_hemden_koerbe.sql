-- Die Hemden gehören in die Körbe (Florian, 18.10.2026).
--
-- Sarahs Bitte gilt genauso dem Showteam, denn dort werden die Hemden
-- ausgezogen: "Alle Hemden in die Körbe, nicht daneben. Nur so kommen
-- sie wirklich alle in die Waschmaschine und es fehlt keins."
--
-- Die Ärmel stehen mit dabei, weil auch das nur der machen kann, der
-- das Hemd gerade trägt: "bitte Ärmel runter machen, das erspart
-- demjenigen, der das übernimmt, so viel Zeit."
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'nach_show',
       'Hemden in die Körbe, nicht daneben, und die Ärmel runterkrempeln',
       135, 'show'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'show' and bereich = 'nach_show' and text like '%Körbe%'
 );
