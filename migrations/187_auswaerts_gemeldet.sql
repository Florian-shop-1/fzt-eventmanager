-- Welche Kollision wurde schon gemeldet? (Florian, 16.10.2026)
--
-- "bitte melden, sobald ein neuer Donnerstagstermin bei uns eingestellt
-- wird im Dezember zum Beispiel. An diesen Tagen kann ich abends auch
-- nur bis ca. 19:00 Uhr."
--
-- Ohne diese Liste kaeme die Mail jede Nacht neu, und nach drei Tagen
-- liest sie niemand mehr.
create table if not exists auswaerts_gemeldet (
  schluessel  text primary key,
  gemeldet_am timestamptz not null default now()
);
