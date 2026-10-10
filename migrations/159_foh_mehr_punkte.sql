-- Mehr Punkte für die FOH-Liste (Florian, 10.10.2026).
--
-- Vor der Show der Rauchmelder, gleich neben der Brandmeldeanlage: Es
-- sind zwei Handgriffe, und wer nur einen macht, merkt es beim ersten
-- Nebel.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'vor_show', 'Rauchmelder ausschalten', 125, 'foh'
 where not exists (
   select 1 from showcheck_punkt p where p.liste = 'foh' and p.text like 'Rauchmelder%'
 );

/*
  Die Pause, in der Reihenfolge, in der sie abläuft.

  Erst das Tuch, dann der Gong, der die Leute zurückholt, und zuletzt
  die drei Handgriffe unmittelbar vor der zweiten Hälfte. Deshalb trägt
  der erste davon die Zeitangabe: Was danach kommt, gehört in denselben
  Moment.
*/
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'pause', t, r, 'foh'
  from (values
    (20, 'Tuch-Check mit Werwolf: wichtig, unten nach innen legen'),
    (30, 'Zweimal Gong vom Show-iPad'),
    (40, 'Kurz vor der zweiten Hälfte: Tür oben UND unten geschlossen?'),
    (50, 'Emporenlicht aus'),
    (60, 'Notausgangslicht ausschalten')
  ) as p(r, t)
 where not exists (
   select 1 from showcheck_punkt x where x.liste = 'foh' and x.bereich = 'pause' and x.text = p.t
 );
