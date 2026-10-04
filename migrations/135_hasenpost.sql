-- Hasenpost: eine persoenliche Nachricht an einen Mitarbeiter.
--
-- Florian will einzelne Leute erinnern, ohne dass es nach Chef klingt:
-- "neuen vertrag unterschreiben, sonst läuft der alte vertrag weiter"
-- (Florian, 04.10.2026). Der Hase sagt es, und wer es liest, sieht nicht,
-- von wem es kommt. Deshalb steht der Absender hier und wird dem
-- Empfaenger nie gezeigt.
create table if not exists hasenpost (
  id                 uuid primary key default gen_random_uuid(),
  benutzer_id        uuid not null references benutzer(id) on delete cascade,
  text               text not null,
  -- Wer sie geschrieben hat. Nur fuer Florians eigene Uebersicht.
  von                text not null default '',
  angelegt_am        timestamptz not null default now(),
  -- Wann der Hase sie zuletzt gezeigt hat. Haelt die Wiederholung im Zaum.
  zuletzt_gezeigt_am timestamptz,
  gezeigt_anzahl     integer not null default 0,
  -- Wann der Mitarbeiter "Mach ich!" geklickt hat. Danach ist Ruhe.
  erledigt_am        timestamptz,
  -- Wann Florian sie zurueckgezogen hat.
  weg_am             timestamptz
);

create index if not exists hasenpost_offen_idx
  on hasenpost (benutzer_id) where erledigt_am is null and weg_am is null;
