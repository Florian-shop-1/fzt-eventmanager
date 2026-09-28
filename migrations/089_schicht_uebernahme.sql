-- Anfrage, eine fremde Schicht zu uebernehmen, um jemanden zu entlasten
-- (Florian, 28.09.2026).
--
-- Gehoert die Schicht einer Aushilfe, wird sofort uebernommen und die
-- Zeile hier dient nur als Protokoll (status gleich 'angenommen'). Gehoert
-- sie jemand Festangestelltem, bleibt sie 'offen', bis Florian oder Kevin
-- annehmen oder ablehnen; erst dann wechselt die Schicht tatsaechlich den
-- Besitzer. bereich unterscheidet Show-Dienstplan (dienst_einsatz, per
-- ditix_event_id + position) und Foyer (foyer_dienst_id).

create table if not exists schicht_uebernahme (
  id               uuid primary key default gen_random_uuid(),
  bereich          text not null check (bereich in ('show', 'foyer')),
  ditix_event_id   text,
  position         text,
  foyer_dienst_id  uuid,
  bisheriger_id    uuid not null references benutzer (id),
  bisheriger_name  text not null,
  anbieter_id      uuid not null references benutzer (id),
  anbieter_name    text not null,
  status           text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt')),
  antwort          text not null default '',
  erstellt_am      timestamptz not null default now(),
  entschieden_von  text,
  entschieden_am   timestamptz
);

create index if not exists schicht_uebernahme_offen on schicht_uebernahme (bereich, status);
