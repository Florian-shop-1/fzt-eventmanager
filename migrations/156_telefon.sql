-- Der digitale Assistent am Telefon (Florian, 09.10.2026).
--
-- Ein KI-Agent nimmt ab, beantwortet die Fragen, die ohnehin jeden Tag
-- kommen (wann spielt ihr, gibt es noch Karten, wo parke ich), und
-- schickt auf Wunsch den Buchungslink per SMS auf die Nummer, von der
-- angerufen wurde.
--
-- Was er NICHT tut: Firmenanfragen und Events beantworten. Dort nimmt er
-- nur auf, worum es geht, und wir rufen zurück.
--
-- Jedes Gespräch wird mitgeschrieben, damit nachvollziehbar bleibt, was
-- der Agent gesagt hat. Das ist kein Beiwerk: Sagt er einmal den
-- falschen Preis, muss man es nachlesen können.

create table if not exists telefon_gespraech (
  id          uuid primary key default gen_random_uuid(),
  -- Die Nummer des Anrufers, soweit sie mitkommt.
  nummer      text not null default '',
  -- 'test' für die Probe im Browser, 'telefon' für einen echten Anruf.
  kanal       text not null default 'telefon',
  begonnen_am timestamptz not null default now(),
  beendet_am  timestamptz,
  -- Der ganze Gesprächsverlauf als JSON, so wie er gelaufen ist.
  verlauf     jsonb not null default '[]'::jsonb,
  -- Worum es ging, in einem Satz. Füllt der Agent am Ende.
  thema       text not null default ''
);

create index if not exists telefon_gespraech_zeit on telefon_gespraech (begonnen_am desc);

-- Was jemand hinterlassen hat und wir zurückrufen müssen.
create table if not exists telefon_notiz (
  id            uuid primary key default gen_random_uuid(),
  gespraech_id  uuid references telefon_gespraech (id) on delete set null,
  -- 'firma' (Firmenfeier, Event), 'gruppe', 'rueckruf' (alles andere).
  art           text not null default 'rueckruf',
  name          text not null default '',
  nummer        text not null default '',
  email         text not null default '',
  anliegen      text not null default '',
  -- Wunschtermin oder Zeitraum, falls genannt. Freitext, so wie gesagt.
  wunschtermin  text not null default '',
  personen      int,
  erledigt_am   timestamptz,
  erledigt_von  text not null default '',
  erstellt_am   timestamptz not null default now()
);

create index if not exists telefon_notiz_offen on telefon_notiz (erledigt_am, erstellt_am desc);
