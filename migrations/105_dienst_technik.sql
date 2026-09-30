-- Eine Technikstelle für Abende ohne Show (Florian, 30.09.2026).
--
-- Mietet eine Firma nur das Haus, gibt es keine Show und damit kein
-- Showteam. Licht, Ton und ein Mikrofon für die Ansprache braucht der
-- Abend trotzdem oft.
--
-- Dafür eine eigene Position statt T1 zu missbrauchen: Übernehmen darf
-- sie jeder, der FOH, T1 oder T2 kann. Für einen Abend ohne Show ist das
-- keine Frage der Spezialisierung, sondern der Verfügbarkeit.

begin;

alter table dienst_quali drop constraint if exists dienst_quali_position_check;
alter table dienst_quali add constraint dienst_quali_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER', 'TECHNIK'));

alter table dienst_fest drop constraint if exists dienst_fest_position_check;
alter table dienst_fest add constraint dienst_fest_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER', 'TECHNIK'));

alter table dienst_einsatz drop constraint if exists dienst_einsatz_position_check;
alter table dienst_einsatz add constraint dienst_einsatz_position_check
  check (position in ('FOH', 'T2', 'T1', 'ZUSCHAUER', 'SHADOW', 'TECHNIK'));

commit;
