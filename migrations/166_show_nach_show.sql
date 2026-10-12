-- Nach der Show hinter der Bühne (Florian, 12.10.2026).
--
-- Beides bleibt sonst über Nacht an: die Todeskralle und das Flying.
-- Der Abschnitt "Nach der Show" war in der Showliste bisher leer, die
-- FOH-Liste hat ihn seit dem 10.10.2026.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'nach_show', t, r, 'show'
  from (values
    (10, 'Todeskralle ausschalten'),
    (20, 'Flying ausschalten')
  ) as p(r, t)
 where not exists (
   select 1 from showcheck_punkt x
    where x.liste = 'show' and x.bereich = 'nach_show' and x.text = p.t
 );
