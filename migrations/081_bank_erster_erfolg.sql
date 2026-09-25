-- Merkt den ersten erfolgreichen Bankabruf (Florian, 23.09.2026).
--
-- Die FinTS-Registrierungsnummer ist bei Atruvia noch nicht bekannt
-- ("9078: Software nicht als FinTS-Produkt registriert"), der geplante
-- Lauf probiert es deshalb zweimal taeglich weiter. Sobald es klappt,
-- soll Florian eine Mail bekommen, statt selbst nachzusehen.
--
-- Die Spalte ist der Merker dafuer: Sie wird genau einmal gesetzt, damit
-- die Nachricht nicht jeden Tag erneut hinausgeht.

alter table bank_stand
  add column if not exists erster_erfolg_am timestamptz,
  add column if not exists erfolg_gemeldet  boolean not null default false;
