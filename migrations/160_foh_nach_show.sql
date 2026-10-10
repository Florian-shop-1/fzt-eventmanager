-- Nach der Show am Pult (Florian, 10.10.2026).
--
-- Erst einmal diese drei. Was noch dazugehoert, kommt, wenn es im
-- Alltag auffaellt: Eine Liste, die zu lang anfaengt, wird nicht
-- gelesen.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'nach_show', t, r, 'foh'
  from (values
    (10, 'Showtechnik runterfahren'),
    (20, 'Interkoms an ihren Platz'),
    (30, 'Batterien zum Laden hängen')
  ) as p(r, t)
 where not exists (
   select 1 from showcheck_punkt x where x.liste = 'foh' and x.bereich = 'nach_show' and x.text = p.t
 );
