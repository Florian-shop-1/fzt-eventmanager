-- Schriftverkehr mit dem Mitarbeiter, abgelegt in seiner Akte.
--
-- "wir möchten auch Schriftverkehr mit dem Mitarbeiter dort ablegen
-- können. Richte es so ein, dass Kevin, Werner oder ich dem Mitarbeiter
-- schreiben können und der Absender dann auch von unserer E-Mail-Adresse
-- kommt" (Florian, 15.10.2026).
--
-- Bisher lief so etwas über Outlook und war im Eventmanager unsichtbar.
-- Wer später wissen wollte, was jemandem geschrieben wurde, musste in
-- drei Postfächern suchen.
create table if not exists personal_nachricht (
  id            uuid primary key default gen_random_uuid(),
  benutzer_id   uuid not null references benutzer (id) on delete cascade,
  -- Wer geschrieben hat, und von welcher Adresse es hinausging.
  von_name      text not null default '',
  von_email     text not null default '',
  an_email      text not null default '',
  betreff       text not null default '',
  text          text not null default '',
  gesendet_am   timestamptz not null default now(),
  -- Leer, wenn die Mail hinausging; sonst steht hier, was schiefging.
  fehler        text not null default ''
);

create index if not exists personal_nachricht_benutzer on personal_nachricht (benutzer_id, gesendet_am desc);
