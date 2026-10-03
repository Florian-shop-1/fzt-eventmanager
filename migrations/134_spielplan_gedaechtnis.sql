-- Der Spielplan, wie wir ihn zuletzt gesehen haben.
--
-- Der Ticketshop liefert nur Vorstellungen, für die man noch Karten kaufen
-- kann. Sobald eine Show angefangen hat, fällt sie aus seiner Liste. Damit
-- war im Eventmanager am selben Abend nach Showbeginn nichts mehr vom Tag
-- zu sehen: kein Funktionsheet, kein Sitzplan, keine Einlassliste
-- (Florian, 03.10.2026, 23:21: "ich kann im eventmanager shows von heute
-- nicht mehr angucken").
--
-- Deshalb merken wir uns jeden Termin, den der Shop einmal genannt hat.
-- Verschwindet er dort, bleibt er hier.
create table if not exists spielplan_termin (
  event_id           text primary key,
  name               text not null default '',
  beginn             timestamptz not null,
  ende               timestamptz,
  ort                text not null default '',
  verkauf            text not null default '',
  art                text not null default '',
  seatmap_event_id   text,
  seatmap_schema_id  text,
  -- Wann der Shop diesen Termin das letzte Mal genannt hat.
  gesehen_am         timestamptz not null default now()
);

create index if not exists spielplan_termin_beginn_idx on spielplan_termin (beginn);
