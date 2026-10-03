-- Weitere Leute im Dienstplan, mit eigener Bezeichnung (Florian, 03.10.2026).
--
-- "beim dienstplan soll es möglich sein weitere personen hinzuzufügen.
-- also nicht schon Schluss nach 3 mitarbeitern" und "ja gerne eigene
-- Bezeichnung. Z.b. Unterstützung bei Event."
--
-- Bisher gab es genau die festen Positionen der Show. Wer an einem Abend
-- eine vierte oder fünfte Person braucht, etwa zum Aufbau oder zur
-- Unterstützung bei einem Firmenevent, konnte sie nirgends eintragen und
-- hat sie dann per WhatsApp organisiert, also außerhalb des Plans.

alter table dienst_einsatz drop constraint if exists dienst_einsatz_position_check;
alter table dienst_einsatz add constraint dienst_einsatz_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER', 'TECHNIK', 'SHADOW',
                      'ZUSATZ1', 'ZUSATZ2', 'ZUSATZ3', 'ZUSATZ4', 'ZUSATZ5'));

-- Wofür die zusätzliche Person da ist, im Klartext. Nur bei ZUSATZ gesetzt.
alter table dienst_einsatz add column if not exists bezeichnung text not null default '';
