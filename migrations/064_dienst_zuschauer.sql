-- Vierte Position im Dienstplan: der eingeweihte Zuschauer
-- (Florian, 22.09.2026).
--
-- In der Show sitzt ein Eingeweihter im Publikum, auf Reihe 4, Platz 3.
-- Gespielt wird er von Roman, Anita, Olena oder Sarah. Damit sie sich
-- selbst eintragen koennen, braucht der Dienstplan die Position.

alter table dienst_quali drop constraint if exists dienst_quali_position_check;
alter table dienst_fest drop constraint if exists dienst_fest_position_check;
alter table dienst_einsatz drop constraint if exists dienst_einsatz_position_check;

alter table dienst_quali add constraint dienst_quali_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER'));
alter table dienst_fest add constraint dienst_fest_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER'));
alter table dienst_einsatz add constraint dienst_einsatz_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER', 'SHADOW'));
