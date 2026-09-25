-- Der Schalter fuer die Abbrecher-Mails (Florian, 23.09.2026).
--
-- Beim ersten Probelauf standen 37 Fragen und 191 Angebote an, also 228
-- Mails an echte Gaeste auf einen Schlag. So etwas geht nicht nebenbei
-- ueber eine naechtliche Uhr hinaus, das entscheidet Florian.
--
-- Deshalb: aus, bis er einschaltet, und danach hoechstens eine
-- begrenzte Zahl je Lauf, damit sich das Nachholen ueber Tage verteilt.

create table if not exists abbruch_einstellung (
  id            int primary key default 1 check (id = 1),
  aktiv         boolean not null default false,
  hoechstens    int not null default 40,
  geaendert_am  timestamptz not null default now(),
  geaendert_von text
);

insert into abbruch_einstellung (id) values (1) on conflict (id) do nothing;
