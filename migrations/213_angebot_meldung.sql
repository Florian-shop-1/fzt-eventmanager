-- Einmal melden, nicht fünfmal (Florian, 26.10.2026).
--
-- "sobald er sie geöffnet hat, muss bei kevin eine mail eingehen. er soll
-- dann anrufen, das fühlt sich dann an wie eine fügung des schicksals für
-- den kunden."
--
-- Damit genau das stimmt, darf die Meldung nicht zur Gewohnheit werden:
-- Wer das Angebot dreimal am Tag aufruft, weil er es dem Chef zeigt,
-- löst trotzdem nur einen Anruf aus. Deshalb steht hier, wann zuletzt
-- gemeldet wurde.
begin;

create table if not exists angebot_meldung (
  id          uuid primary key default gen_random_uuid(),
  angebot_id  uuid not null references angebot (id) on delete cascade,
  gemeldet_am timestamptz not null default now()
);

create index if not exists angebot_meldung_angebot on angebot_meldung (angebot_id, gemeldet_am desc);

commit;
