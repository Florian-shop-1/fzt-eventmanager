-- Zahlung vor Ort.
--
-- Nicht jedes Menü ist vorher bezahlt. Es kommt vor, dass eine Firma nur
-- die Tickets übernimmt und jeder Gast sein Essen selbst zahlt, oder dass
-- eine Gruppe erst am Abend abrechnet. Dann muss am Tisch kassiert werden.
--
-- Das ist der einzige Fall, in dem die Gastronomie einen Preis sehen darf
-- und muss: Wer kassieren soll, muss wissen wie viel. Alle anderen Beträge
-- bleiben für sie unsichtbar.
--
-- Festgelegt wird der Betrag vom Team im Vorgang. Die Gastronomie liest
-- ihn nur, ändern kann sie ihn nicht.

alter table gruppe add column if not exists vor_ort_kassieren boolean not null default false;
alter table gruppe add column if not exists vor_ort_betrag_cent integer;
alter table gruppe add column if not exists vor_ort_hinweis text;
alter table gruppe add column if not exists vor_ort_kassiert_am timestamptz;
alter table gruppe add column if not exists vor_ort_kassiert_von text;

comment on column gruppe.vor_ort_kassieren is
  'true, wenn für diese Gruppe am Abend vor Ort kassiert werden muss.';
comment on column gruppe.vor_ort_betrag_cent is
  'Zu kassierender Bruttobetrag in Cent. Leer bedeutet: aus den Menüs gerechnet.';
comment on column gruppe.vor_ort_hinweis is
  'Klartext für den Service, etwa "jeder Gast zahlt sein Menü selbst".';
comment on column gruppe.vor_ort_kassiert_am is
  'Wann das Geld eingegangen ist. Wird am Abend im Funktionsheet gesetzt.';
