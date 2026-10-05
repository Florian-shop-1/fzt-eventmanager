-- Tipps & Tricks gehoeren zu einem Bereich: Show oder Foyer.
--
-- "Foyer Mitarbeiter sollen nur in die Tipp Tricks des Foyers. und Show
-- nur in Show" (Florian, 05.10.2026). Wer im Foyer arbeitet, braucht die
-- Kaffeemaschine und die Kasse, nicht das Lichtpult; und umgekehrt.
--
-- Alles, was bisher da ist, gehoert zur Show: Es sind Anleitungen zu
-- Technik, Pult und Serverraum.
alter table tipp add column if not exists bereich text not null default 'show';
alter table tipp_reihe add column if not exists bereich text not null default 'show';

alter table tipp drop constraint if exists tipp_bereich_check;
alter table tipp add constraint tipp_bereich_check check (bereich in ('show', 'foyer'));

alter table tipp_reihe drop constraint if exists tipp_reihe_bereich_check;
alter table tipp_reihe add constraint tipp_reihe_bereich_check check (bereich in ('show', 'foyer'));

create index if not exists tipp_bereich_idx on tipp (bereich);
