-- Hinweise zum Abend, von Hand eingetragen (Florian, 21.09.2026).
--
-- Kevin hat solche Informationen bisher im Kalender stehen: Platzierung,
-- Menüaufteilung, Sonderwünsche, offene Fragen. Sie gehören dorthin, wo
-- sie gebraucht werden, also aufs Funktionsheet und ins Foyer-Blatt.
--
-- Bewusst freier Text: Was im Kalender steht, soll man eins zu eins
-- übernehmen können, ohne es in Felder zu pressen. Wer schreibt und wann
-- zuletzt geändert wurde, steht daneben.

create table if not exists abend_hinweis (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null,
  -- Worum es geht, etwa "Firma Noerpel". Darf leer bleiben.
  titel         text not null default '',
  text          text not null,
  erstellt_von  text not null,
  erstellt_am   timestamptz not null default now(),
  geaendert_von text,
  geaendert_am  timestamptz,
  sortierung    int not null default 0
);

create index if not exists abend_hinweis_datum on abend_hinweis (datum);
