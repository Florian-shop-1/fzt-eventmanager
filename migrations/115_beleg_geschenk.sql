-- Geschenke: an Mitarbeiter oder an Geschäftspartner.
--
-- Ein Tankgutschein für einen Mitarbeiter ist steuerlich etwas anderes
-- als Druckerpapier: Sachbezüge bis 50 Euro im Monat je Person bleiben
-- steuerfrei, und dafür muss man wissen, wer was wann bekommen hat
-- (Florian, 01.10.2026). Geschenke an Geschäftspartner stehen wieder
-- unter anderen Regeln, deshalb werden beide getrennt gehalten.

alter table bewirtung add column if not exists geschenk text not null default '';
alter table bewirtung add column if not exists geschenk_fuer text not null default '';

alter table bewirtung drop constraint if exists bewirtung_geschenk_check;
alter table bewirtung add constraint bewirtung_geschenk_check
  check (geschenk = any (array['', 'mitarbeiter', 'partner']));

create index if not exists bewirtung_geschenk_idx on bewirtung (geschenk, datum) where geschenk <> '';
