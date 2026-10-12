-- Ein Punkt kann auf eine Anleitung zeigen (Florian, 12.10.2026).
--
-- Bisher ging nur ein einzelnes Video aus Tipps und Tricks (tipp_id).
-- Das Hochfahren der Showtechnik steht dort aber als Reihe in mehreren
-- Schritten, und genau die soll hinter dem Punkt stecken: "hier machst
-- du den link dahinter zu tipps und tricks, dort gibts ja eine
-- ausführliche anleitung".
alter table showcheck_punkt add column if not exists link_url text;
alter table showcheck_punkt add column if not exists link_titel text;

-- Der erste Punkt am Pult, noch vor allem anderen.
insert into showcheck_punkt (bereich, text, reihenfolge, liste, link_url, link_titel)
select 'vor_show', 'Showroom-Technik hochfahren', 5, 'foh',
       '/tipps/reihe/' || r.id, 'Anleitung in Schritten'
  from tipp_reihe r
 where r.titel = 'Showtechnik im Showroom einschalten'
   and not exists (
     select 1 from showcheck_punkt p
      where p.liste = 'foh' and p.text like 'Showroom-Technik%'
   );
