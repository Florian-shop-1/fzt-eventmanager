-- Einmal erinnern, nicht jeden Tag (Florian, 26.10.2026).
--
-- "ja auch zu der mail, dass die option ausläuft. er soll dann anrufen
-- und soll nochmal verlängern können."
--
-- Die Erinnerung geht am Tag vor dem Ablauf. Wird die Option verlängert,
-- ändert sich das Ablaufdatum, und dann darf erneut erinnert werden:
-- Deshalb steht hier das Datum mit dabei und nicht nur der Vorgang.
begin;

create table if not exists option_erinnerung (
  vorgang     text not null,
  gilt_bis    timestamptz not null,
  gemeldet_am timestamptz not null default now(),
  primary key (vorgang, gilt_bis)
);

commit;
