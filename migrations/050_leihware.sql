-- Ware, die sich die Gastro bei uns nimmt (Florian, 21.09.2026).
--
-- Beispiel: Osmans Leute holen sich eine Flasche Aperol aus unserem Bestand.
-- Entweder sie geben sie zurück, dann kostet es nichts, oder sie kommt auf
-- die Monatsrechnung. Berechnet wird der übliche Marktpreis plus 10 Prozent.
--
-- Der Marktpreis steht im Katalog, damit niemand jedes Mal nachschauen muss.
-- Er ist der Brutto-Ladenpreis, wie man ihn im Handel zahlt; für die Rechnung
-- wird daraus der Nettobetrag gerechnet.

create table if not exists leih_artikel (
  id              text primary key,
  name            text not null,
  -- Üblicher Ladenpreis brutto, recherchiert. Quelle und Stand daneben.
  marktpreis_cent int not null,
  quelle          text not null default '',
  stand           date,
  aktiv           boolean not null default true,
  sortierung      int not null default 0
);

create table if not exists wein_leihe (
  id              uuid primary key default gen_random_uuid(),
  datum           date not null default (now() at time zone 'Europe/Berlin')::date,
  artikel_id      text references leih_artikel (id),
  name            text not null,
  menge           int not null check (menge between 1 and 100),
  -- Marktpreis brutto und der berechnete Preis (plus 10 Prozent), je Stück.
  marktpreis_cent int not null,
  preis_cent      int not null,
  notiz           text not null default '',
  status          text not null default 'offen' check (status in ('offen', 'zurueck')),
  erfasst_von     text not null,
  erstellt_am     timestamptz not null default now(),
  zurueck_am      timestamptz,
  zurueck_von     text
);

create index if not exists wein_leihe_datum on wein_leihe (datum);

-- Ein paar übliche Flaschen als Start. Preise sind Richtwerte aus dem Handel
-- (Stand September 2026) und lassen sich jederzeit ändern.
insert into leih_artikel (id, name, marktpreis_cent, quelle, stand, sortierung) values
  ('aperol',    'Aperol 0,7 l',              1299, 'Handel, Richtwert', '2026-09-21', 1),
  ('prosecco',  'Prosecco 0,75 l',            799, 'Handel, Richtwert', '2026-09-21', 2),
  ('gin',       'Gin 0,7 l',                 1999, 'Handel, Richtwert', '2026-09-21', 3),
  ('vodka',     'Wodka 0,7 l',               1499, 'Handel, Richtwert', '2026-09-21', 4),
  ('whisky',    'Whisky 0,7 l',              2499, 'Handel, Richtwert', '2026-09-21', 5),
  ('campari',   'Campari 0,7 l',             1499, 'Handel, Richtwert', '2026-09-21', 6),
  ('sekt',      'Sekt 0,75 l',                999, 'Handel, Richtwert', '2026-09-21', 7),
  ('tonic',     'Tonic Water 6 x 0,2 l',      699, 'Handel, Richtwert', '2026-09-21', 8),
  ('orangensaft','Orangensaft 1 l',           249, 'Handel, Richtwert', '2026-09-21', 9),
  ('mineral',   'Mineralwasser 12 x 0,7 l',   899, 'Handel, Richtwert', '2026-09-21', 10)
on conflict (id) do nothing;
