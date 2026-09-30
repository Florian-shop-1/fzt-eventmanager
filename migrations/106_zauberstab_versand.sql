-- Zauberstäbe aus dem Gewinnspiel verschicken (Florian, 30.09.2026).
--
-- Wer beim Eurowings-Gewinnspiel mitmacht, bekommt nicht mehr sieben
-- Prozent Rabatt, sondern einen erscheinenden Zauberstab mit der Post.
-- Das ist ein Geschenk, das man in der Hand hält, und es kostet den
-- Teilnehmer nichts: Er muss nur seine Anschrift dalassen.
--
-- Damit gibt es etwas zu verschicken, und das gehört dorthin, wo auch die
-- Gutscheine stehen: in eine Liste, die jemand abarbeitet. Sonst liegt
-- die Anschrift in einer Mail und niemand weiß, ob das Päckchen raus ist.

begin;

create table if not exists zauberstab_versand (
  id            uuid primary key default gen_random_uuid(),
  vorname       text not null default '',
  nachname      text not null default '',
  email         text not null default '',
  strasse       text not null default '',
  plz           text not null default '',
  ort           text not null default '',
  land          text not null default 'Deutschland',
  -- Woher die Anmeldung kam, etwa "wings-gewinnspiel".
  quelle        text not null default '',
  notiz         text not null default '',
  eingegangen_am timestamptz not null default now(),
  versendet_am  timestamptz,
  versendet_von text
);

-- Dieselbe Person nicht zweimal beliefern: Eine Adresse je Mailadresse
-- und Quelle reicht.
create unique index if not exists zauberstab_einmal
  on zauberstab_versand (lower(email), quelle) where email <> '';

create index if not exists zauberstab_offen on zauberstab_versand (versendet_am, eingegangen_am);

commit;
