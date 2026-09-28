-- Belege für die anderen beiden Gesellschaften (Florian, 28.09.2026).
--
-- Florian führt neben dem Theater noch die Magic-Expert GbR und die True
-- Talent GmbH. Deren Ausgaben laufen über dieselben Belege, dieselben
-- Regeln und denselben Ablauf, gehören aber in getrennte Bücher.
--
-- Deshalb eine Spalte statt einer zweiten Tabelle: Scannen, Lesen,
-- Festschreiben, Stornieren und der Schutz vor Änderungen bleiben für
-- alle gleich. Getrennt wird erst beim Auswerten.
--
-- Die laufende Nummer bekommt je Gesellschaft einen eigenen Kreis, sonst
-- hätte das Theater Lücken in seiner Zählung. Die bisherigen Nummern
-- (B-2026-001, E-2026-004) bleiben unverändert, sie gehören zum Theater.
--
-- Die Schutzfunktion aus 044 bleibt unangetastet: Sie vergleicht die
-- ganze Zeile als JSON und erfasst damit auch diese neue Spalte von
-- selbst. An einem festgeschriebenen Beleg lässt sich die Gesellschaft
-- also nicht mehr ändern.

begin;

alter table bewirtung add column if not exists gesellschaft text not null default 'fzt'
  check (gesellschaft in ('fzt', 'magic-expert', 'true-talent'));

create index if not exists bewirtung_gesellschaft on bewirtung (gesellschaft, datum);

commit;
