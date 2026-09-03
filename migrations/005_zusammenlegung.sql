-- Zwei oder mehr Shop-Bestellungen zu einer Gruppe zusammenlegen.
--
-- Anlass: Derselbe Gast bestellt zweimal, etwa weil jemand nachträglich
-- dazukommt. In der Verkaufsliste sind das zwei Bestellungen, am Tisch ist
-- es eine Gruppe. Ohne Zusammenlegung setzt der Planer sie an zwei Tische.
--
-- Das Programm schlägt Zusammenlegungen bei gleichem Namen am selben Abend
-- vor, entscheidet aber nie selbst: Namensgleichheit ist kein Beweis, zwei
-- verschiedene Gäste können gleich heißen.

create table if not exists zusammenlegung (
  id              uuid primary key default gen_random_uuid(),
  vorstellung_id  uuid        not null references vorstellung (id) on delete cascade,
  -- Kennungen der zusammengelegten Gruppen, etwa 'shop-<Bestellnummer>'.
  gruppen_ids     text[]      not null,
  -- Anzeigename der zusammengelegten Gruppe.
  name            text        not null,
  angelegt_von    text,
  angelegt_am     timestamptz not null default now(),
  constraint mindestens_zwei check (array_length(gruppen_ids, 1) >= 2)
);

create index if not exists zusammenlegung_vorstellung_idx
  on zusammenlegung (vorstellung_id);
