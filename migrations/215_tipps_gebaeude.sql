-- Tipps & Tricks auch fürs Gebäude (Florian, 26.10.2026).
--
-- "lass uns einen neuen menüpunkt machen im manager, den wir gebäude
-- nennen, nur für kevin und mich. als erstes kommt dort auch ein
-- unterpunkt Tipps und Tricks, selbes prinzip wie bei foyer und show.
-- es gibt videos zu bestimmten themen die wiederkehren."
--
-- Haustechnik ist genau so ein Fall: Die Lüftung stellt man zweimal im
-- Jahr um, und beim zweiten Mal weiß niemand mehr, wie. Deshalb derselbe
-- Weg wie bei Show und Foyer, nur ein eigener Bereich, damit das Foyer
-- nicht zwischen Kaffeemaschine und Heizungsregelung suchen muss.
begin;

alter table tipp drop constraint if exists tipp_bereich_check;
alter table tipp add constraint tipp_bereich_check
  check (bereich in ('show', 'foyer', 'gebaeude'));

alter table tipp_reihe drop constraint if exists tipp_reihe_bereich_check;
alter table tipp_reihe add constraint tipp_reihe_bereich_check
  check (bereich in ('show', 'foyer', 'gebaeude'));

commit;
