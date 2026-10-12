-- Mehr als Glas, Bändchen und Zauberstab (Florian, 12.10.2026).
--
-- Kevin wollte für den 25.10. vier Freigetränke und zwei Popcorn
-- hinterlegen und fand keinen Weg dafür. Bisher kannte die Liste nur
-- die drei Geschenke aus der Abbrecher-Strecke.
--
-- Dazu ein Freitext: Was wir verschenken, steht nicht ein für alle Mal
-- fest, und eine Liste, die jedes Mal eine Migration braucht, ist in
-- der Praxis keine.
alter table abbruch_geschenk drop constraint if exists abbruch_geschenk_art_check;
alter table abbruch_geschenk add constraint abbruch_geschenk_art_check
  check (art in ('baendchen', 'glas', 'zauberstab', 'getraenk', 'popcorn', 'sonstiges'));

alter table abbruch_geschenk add column if not exists eigenes text not null default '';
comment on column abbruch_geschenk.eigenes is
  'Bei art = sonstiges: was verschenkt wird, im Klartext fuer die Bar.';
