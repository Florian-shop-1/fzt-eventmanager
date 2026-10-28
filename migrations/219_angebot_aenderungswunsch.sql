-- Der Kunde hat Aenderungswuensche.
--
-- "wie aendern wir ein angebot, wenn der kunde aederungswuensch hat?
-- soll er auch gleich was klicken koennen dafuer in der mail" (Florian,
-- 28.10.2026).
--
-- Bisher gab es auf der Angebotsseite nur zusagen oder ablehnen. Dazwischen
-- liegt der haeufigste Fall: Es passt fast, nur der Termin nicht, oder es
-- werden zehn Leute mehr. Wer dafuer auf "passt nicht" klicken muss, sagt
-- in unseren Zahlen ab, obwohl er kaufen will, und die blockierten Plaetze
-- gehen dabei zurueck in den Verkauf.
--
-- Deshalb ein eigener Weg: Der Wunsch wird hier vermerkt, das Angebot
-- bleibt offen, und die Plaetze bleiben blockiert.

alter table angebot
  add column if not exists aenderung_wunsch text,
  add column if not exists aenderung_am     timestamptz;
