-- Wer die Belege welcher Firma bekommt (Florian, 29.09.2026).
--
-- Jede Gesellschaft hat ihren eigenen Empfänger:
--   Florian Zimmer Theater GmbH  Steuerbüro Buschow
--   True Talent GmbH             Steuerbüro Katja Butz
--   Magic-Expert GbR             Werner Zimmer, der die Bücher selbst macht
--
-- Deshalb steht der Empfänger je Firma in der Datenbank und nicht einmal
-- für alle: Eine gemeinsame Adresse würde früher oder später die Belege
-- der einen Firma an das Steuerbüro der anderen schicken.
--
-- Die Adressen selbst trägt Florian im Programm ein. Hier stehen nur die
-- Namen, damit er sieht, welche Zeile zu wem gehört.

begin;

create table if not exists beleg_steuerbuero (
  gesellschaft text primary key check (gesellschaft in ('fzt', 'magic-expert', 'true-talent')),
  name         text not null default '',
  email        text not null default '',
  -- Stille Kopie ins Haus, damit nachvollziehbar bleibt, was raus ist.
  kopie_an     text not null default ''
);

insert into beleg_steuerbuero (gesellschaft, name) values
  ('fzt', 'Steuerbüro Buschow'),
  ('true-talent', 'Steuerbüro Katja Butz'),
  ('magic-expert', 'Werner Zimmer')
on conflict (gesellschaft) do nothing;

-- Was wann an wen hinausgegangen ist. Ein Monat kann mehrfach
-- verschickt werden, etwa wenn ein Beleg nachkommt; jede Sendung steht
-- als eigene Zeile, nichts wird überschrieben.
create table if not exists beleg_versand (
  id           uuid primary key default gen_random_uuid(),
  gesellschaft text not null,
  monat        text not null,
  versendet_am timestamptz not null default now(),
  versendet_von text not null default '',
  versendet_an text not null,
  anzahl       int not null default 0,
  summe_cent   bigint not null default 0
);

create index if not exists beleg_versand_monat on beleg_versand (gesellschaft, monat, versendet_am desc);

commit;
