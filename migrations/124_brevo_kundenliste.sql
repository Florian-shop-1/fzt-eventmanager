-- Welche Brevo-Liste die Kundenliste ist (Florian, 01.10.2026).
--
-- "wenn du eine rechnung von hand schreibst, schnapp dir auch die daten
-- und lege diese in brevo ab ... wir wollen auf jeden fall, dass jeder
-- kunde auch im newsletter ist."
--
-- Bisher gab es mit Absicht keine Standardliste, damit niemand
-- versehentlich in den Newsletter rutscht. Daran aendert sich im Kern
-- nichts: Es gibt weiterhin keine Liste von selbst, sondern genau die
-- eine, die Florian hier einmal auswaehlt.

create table if not exists brevo_einstellung (
  id                int primary key default 1 check (id = 1),
  kunden_liste_id   int,
  kunden_liste_name text not null default '',
  geaendert_von     text not null default '',
  geaendert_am      timestamptz not null default now()
);

insert into brevo_einstellung (id) values (1) on conflict (id) do nothing;
