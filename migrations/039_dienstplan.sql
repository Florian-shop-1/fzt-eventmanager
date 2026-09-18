-- Dienstplan für das Showteam.
--
-- Florian (18.09.2026): In ULMFASSBAR und Magic Memories sind immer drei
-- Positionen zu besetzen:
--   FOH  Licht und Ton        (Leeven, Sabah, Levi)
--   T2   Techniker 2          (Mario, Julian, Noel, Sarah, Chris, Sammy)
--   T1   Techniker 1          (Ben, fest angestellt, jede Show)
-- Flo-Zirkus macht immer Ben allein (T1).
--
-- Neue (Sarah, Noel, Chris, Sammy) können T2 noch nicht allein. Sie laufen
-- als "Shadow" mit, und zwar nur, wenn Mario oder Julian T2 hat. Das bildet
-- die Spalte "lernt" ab: Wer bei T2 noch lernt, kann nur Shadow übernehmen.
--
-- Die Schichten selbst werden nicht vorab angelegt. Sie ergeben sich aus dem
-- Spielplan in Ditix, den festen Tagen und den Einträgen hier. Eine Zeile in
-- dienst_einsatz gibt es erst, wenn jemand etwas ändert: übernimmt, absagt,
-- tauscht oder Florian jemanden einteilt.

-- Wer welche Position kann.
create table if not exists dienst_quali (
  benutzer_id uuid not null references benutzer (id) on delete cascade,
  position    text not null check (position in ('FOH', 'T2', 'T1')),
  lernt       boolean not null default false,
  primary key (benutzer_id, position)
);

-- Feste Tage: Wochentag (0 = Sonntag ... 6 = Samstag) oder jeden Tag (null).
create table if not exists dienst_fest (
  id          uuid primary key default gen_random_uuid(),
  position    text not null check (position in ('FOH', 'T2', 'T1')),
  wochentag   int check (wochentag between 0 and 6),
  benutzer_id uuid not null references benutzer (id) on delete cascade,
  unique (position, wochentag)
);

-- Abweichungen vom festen Plan und alle freien Einträge.
create table if not exists dienst_einsatz (
  ditix_event_id text not null,
  position       text not null check (position in ('FOH', 'T2', 'T1', 'SHADOW')),
  datum          date not null,
  uhrzeit        text,
  -- Leer heißt: offen, jemand wird gesucht.
  benutzer_id    uuid references benutzer (id) on delete set null,
  -- Wer abgesagt hat und warum, damit die anderen es verstehen.
  abgesagt_von   text,
  grund          text,
  geaendert_von  text,
  geaendert_am   timestamptz not null default now(),
  -- Wie oft schon an die anderen erinnert wurde (0, 7, 3, 1 Tage vorher).
  erinnert_stufe int not null default 0,
  primary key (ditix_event_id, position)
);

create index if not exists dienst_einsatz_datum on dienst_einsatz (datum);

-- Florian will in zwei Wochen gefragt werden, welche Tage bei T2 fest sind.
create table if not exists dienst_einstellung (
  id                int primary key default 1 check (id = 1),
  feste_tage_fragen date,
  feste_tage_erledigt_am timestamptz
);
insert into dienst_einstellung (id, feste_tage_fragen) values (1, '2026-10-02') on conflict (id) do nothing;
