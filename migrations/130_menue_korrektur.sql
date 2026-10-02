-- Menüs korrigieren statt nur streichen (Florian, 02.10.2026).
--
-- "aber auch dass man ändern kann. also z.b. jemand hat 8 - auf 4
-- korrigieren. name dazu wer storniert hat."
--
-- Ein ganzer Storno ist der eine Fall, der häufigere ist der halbe: Von
-- acht Menüs kommen vier nicht. Deshalb kann ein Eintrag jetzt beides
-- sein, und was gilt, steht in art.

alter table menue_storno add column if not exists art text not null default 'storno'
  check (art in ('storno', 'korrektur'));
-- Die korrigierten Mengen. Leer heißt: unverändert aus der Bestellung.
alter table menue_storno add column if not exists classic int;
alter table menue_storno add column if not exists sea int;
alter table menue_storno add column if not exists veggy int;
alter table menue_storno add column if not exists kids int;
