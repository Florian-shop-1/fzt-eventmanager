-- Die Postkartenwand (Florian, 27.10.2026).
--
-- "Ich habe Tausende handgeschriebene Postkarten von Gästen ... Das muss
-- digital zum Erlebnis werden."
--
-- Drei Dinge trennt diese Tabelle bewusst voneinander:
--
-- 1. Was auf der Karte steht (Transkription, Zitat, Bewertung). Das
--    entscheidet, ob eine Karte gut genug für die Wand ist.
-- 2. Ob sie gezeigt werden DARF (Datenschutz). Eine großartige Karte mit
--    Adresse darauf bleibt trotzdem drinnen. Die zwei Fragen werden nie
--    miteinander verrechnet.
-- 3. Das Bild selbst. Das Original liegt hier in der Datenbank und
--    verlässt das Haus nie. Öffentlich wird nur eine geschwärzte
--    Fassung, und die entsteht erst, wenn ein Mensch die Schwärzung
--    bestätigt hat.
--
-- Das Original als bytea und nicht im Blob-Speicher: Eine Blob-Adresse
-- ist öffentlich, auch wenn sie niemand kennt. Hier kommt niemand an das
-- Bild, der nicht angemeldet ist.
begin;

create table if not exists postkarte (
  id              uuid primary key default gen_random_uuid(),

  -- neu          gescannt, noch nicht gelesen
  -- gelesen      KI ist durch, wartet auf den Menschen
  -- freigegeben  Datenschutz geprüft, darf öffentlich
  -- zurueck      bewusst zurückgehalten
  -- verworfen    Fehlgriff, Dublette, unlesbar
  status          text not null default 'neu',

  -- Das Original. Nur über eine angemeldete Sitzung zu sehen.
  bild            bytea,
  bild_typ        text not null default 'image/jpeg',
  -- Die geschwärzte Fassung für die Webseite, im Blob-Speicher.
  bild_oeffentlich text not null default '',

  -- Was die KI gelesen hat.
  transkript      text not null default '',
  zitat           text not null default '',
  zusammenfassung text not null default '',
  -- begeistert, positiv, gemischt, kritisch
  stimmung        text not null default '',
  -- 1 bis 10, wie gut sich die Karte für die Wand eignet.
  bewertung       int not null default 0,
  -- ulmfassbar, magic-memories, flo-zirkus, familie, erlebnis, aussergewoehnlich
  themen          text[] not null default '{}',
  -- Die Rohantwort des Modells, zum Nachsehen.
  gelesen         jsonb not null default '{}'::jsonb,

  -- Datenschutz, bewusst getrennt von der Bewertung.
  -- offen   noch niemand geprüft
  -- frei    geprüft, nichts Persönliches mehr sichtbar
  -- gesperrt  enthält Persönliches, bleibt drinnen
  datenschutz     text not null default 'offen',
  -- Was die KI an Persönlichem gefunden hat, mit ungefährer Lage im Bild.
  personenbezug   jsonb not null default '[]'::jsonb,
  -- Hat der Gast der Veröffentlichung zugestimmt? Bei alten Karten steht
  -- hier "unbekannt", und die bleiben drinnen, bis jemand entscheidet.
  einwilligung    text not null default 'unbekannt',

  highlight       boolean not null default false,
  -- Für die Dublettenerkennung: die ersten Zeichen der Transkription,
  -- normalisiert. Zwei Scans derselben Karte lesen sich gleich.
  fingerabdruck   text not null default '',
  dublette_von    uuid references postkarte(id) on delete set null,

  show            text not null default '',
  gescannt_von    text not null default '',
  notiz           text not null default '',
  fehler          text not null default '',
  erstellt_am     timestamptz not null default now(),
  gelesen_am      timestamptz,
  veroeffentlicht_am timestamptz
);

create index if not exists postkarte_status on postkarte (status, erstellt_am desc);
create index if not exists postkarte_wand
  on postkarte (bewertung desc, veroeffentlicht_am desc)
  where status = 'freigegeben' and datenschutz = 'frei';
create index if not exists postkarte_fingerabdruck on postkarte (fingerabdruck)
  where fingerabdruck <> '';

comment on column postkarte.bild is
  'Das Original mit Namen und Unterschrift. Verlaesst das Haus nie.';
comment on column postkarte.bild_oeffentlich is
  'Die geschwaerzte Fassung. Entsteht erst, wenn ein Mensch die Schwaerzung bestaetigt hat.';

commit;
