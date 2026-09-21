-- Stempeluhr: Korrekturen, Anträge und die Pausenpflicht (Florian, 21.09.2026).
--
-- Drei Dinge kommen dazu:
--  1. Werner, Kevin und Florian dürfen Zeiten ändern. Jede Änderung merkt
--     sich, wer sie gemacht hat und wie die Zeit vorher lautete. Eine
--     Arbeitszeiterfassung muss nachvollziehbar bleiben.
--  2. Mitarbeiter ändern nichts selbst, sondern stellen einen Antrag.
--  3. Nach sechs Stunden ohne Pause bekommt der Mitarbeiter eine Mail.
--     Das Arbeitszeitgesetz verlangt spätestens dann eine Pause. Er kann
--     dazuschreiben, warum es nicht anders ging.

alter table stempel add column if not exists geaendert_von text;
alter table stempel add column if not exists geaendert_am timestamptz;
alter table stempel add column if not exists original_zeitpunkt timestamptz;

-- Bisher gab es je Schicht nur eine Meldung. Jetzt kann es mehrere geben:
-- zu lange eingestempelt, Gelände verlassen, Pause fällig.
alter table stempel_meldung drop constraint if exists stempel_meldung_pkey;
alter table stempel_meldung add primary key (kommen_id, grund);

-- Änderungswünsche der Mitarbeiter und die Begründungen zu fehlenden Pausen.
create table if not exists stempel_antrag (
  id              uuid primary key default gen_random_uuid(),
  benutzer_id     uuid not null references benutzer (id) on delete cascade,
  name            text not null,
  -- 'aenderung': Bitte um Korrektur. 'pausengrund': Warum die Pause ausfiel.
  art             text not null default 'aenderung' check (art in ('aenderung', 'pausengrund')),
  tag             date not null,
  text            text not null,
  status          text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt', 'notiert')),
  antwort         text not null default '',
  erstellt_am     timestamptz not null default now(),
  entschieden_von text,
  entschieden_am  timestamptz
);

create index if not exists stempel_antrag_offen on stempel_antrag (status, erstellt_am desc);
create index if not exists stempel_antrag_person on stempel_antrag (benutzer_id, erstellt_am desc);
