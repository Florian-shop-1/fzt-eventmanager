-- Der Wunschtag einer Anfrage ohne Termin (Florian, 26.10.2026).
--
-- "bitte hier eintragen, wenn ja kein termin bekannt ist: Wunschtag, Mo,
-- Di, Mi, usw."
--
-- Den Wunschzeitraum gibt es schon ("in den nächsten 3 Monaten"), der
-- sagt aber nichts über den Wochentag. Genau der entscheidet bei uns
-- alles: Freitag und Samstag sind die teuren Abende, unter der Woche
-- geht viel mehr. Wer das beim ersten Telefonat notiert, muss nicht
-- zweimal fragen.
begin;

alter table vorgang add column if not exists wunschtag text;

comment on column vorgang.wunschtag is
  'Wunsch-Wochentag, wenn kein Termin feststeht: Montag bis Sonntag. NULL heißt: egal oder nicht gefragt.';

commit;
