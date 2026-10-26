-- Passwort vergessen: der Link, der eine Stunde gilt (Florian, 25.10.2026).
--
-- "bitte schaffe eine passwort vergessen funktion für den mitarbeiter im
-- eventmanager. er bekommt dann eine mail und kann selber zurücksetzen,
-- das bekannte prinzip."
--
-- Gespeichert wird nicht der Link selbst, sondern seine Prüfsumme. Wer
-- die Datenbank liest, kann sich damit kein fremdes Passwort setzen. Das
-- ist dieselbe Überlegung wie bei den Passwörtern nebenan.
--
-- Ein Link gilt eine Stunde und genau einmal. Fordert jemand einen neuen
-- an, verfallen die alten: Sonst liegen in einem Postfach fünf gültige
-- Schlüssel zum selben Zugang.
begin;

create table if not exists passwort_token (
  id           uuid primary key default gen_random_uuid(),
  benutzer_id  uuid not null references benutzer (id) on delete cascade,
  -- sha256 des Schlüssels aus dem Link, hex.
  pruefsumme   text not null unique,
  erstellt_am  timestamptz not null default now(),
  gueltig_bis  timestamptz not null,
  benutzt_am   timestamptz,
  -- Nur zur Spurensuche: Von wo kam die Anforderung?
  angefordert_von text not null default ''
);

create index if not exists passwort_token_benutzer on passwort_token (benutzer_id, gueltig_bis desc);

commit;
