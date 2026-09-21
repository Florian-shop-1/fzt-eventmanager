-- Umgesetzte Gruppen am Einlass (Florian, 21.09.2026).
--
-- Der Vorschlag sagt, wohin eine Gruppe koennte. Wo sie am Ende wirklich
-- sitzt, entscheidet der Einlass am Tablet: Gruppe antippen, freien Platz
-- antippen, fertig. Das wird hier festgehalten, denn in Ditix schreibt
-- das Programm bewusst nichts (siehe lib/ditix/spielplan.ts).
--
-- Der Schluessel ist die Herkunft: bei einer Gruppe ihre alten Sitze, bei
-- einem Gast von der Gaesteliste dessen Kennung. So laesst sich dieselbe
-- Gruppe beliebig oft umsetzen, ohne dass Doppeleintraege entstehen.

create table if not exists upgrade_umsetzung (
  id             uuid primary key default gen_random_uuid(),
  ditix_event_id text not null,
  schluessel     text not null,
  art            text not null default 'gruppe' check (art in ('gruppe', 'gast')),
  quelle_text    text not null default '',
  ziel_text      text not null,
  ziel_ids       bigint[] not null default '{}',
  personen       int not null default 0,
  gesetzt_von    text,
  gesetzt_am     timestamptz not null default now(),
  unique (ditix_event_id, schluessel)
);

create index if not exists upgrade_umsetzung_event on upgrade_umsetzung (ditix_event_id);
