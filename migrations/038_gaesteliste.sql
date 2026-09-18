-- Gästeliste für die Show: Freikarten, Presse, Freunde des Hauses.
--
-- Florian (18.09.2026): Er und Kevin tragen Name und Anzahl Showtickets
-- ein. Diese Gäste haben kein Ticket in Ditix und keinen festen Platz. Sie
-- werden erst vor Ort gesetzt, so wie frei ist, und zwar von dem, der den
-- Saalplan druckt und die Upgrades macht. Deshalb stehen sie auf dem
-- Upgrade-Ausdruck, mit einem Platzvorschlag, und auf der Einlassliste.

create table if not exists gaesteliste (
  id             uuid primary key default gen_random_uuid(),
  ditix_event_id text not null,
  datum          date not null,
  uhrzeit        text,
  name           text not null,
  anzahl         int  not null check (anzahl between 1 and 30),
  notiz          text,
  erstellt_von   text not null,
  erstellt_am    timestamptz not null default now(),
  -- Vor Ort: wo sie tatsächlich sitzen, und wer das eingetragen hat.
  platz          text,
  gesetzt_von    text,
  gesetzt_am     timestamptz
);

create index if not exists gaesteliste_vorstellung on gaesteliste (ditix_event_id);
create index if not exists gaesteliste_datum on gaesteliste (datum);
