-- Tipps & Tricks: eine kleine Videosammlung mit Anleitungen fuer das
-- Showteam, z. B. wie eine 12-Volt-Batterie geladen wird (Florian, 28.09.2026).
--
-- Schlagworte sind ein eigenes, freies Textfeld statt nur Titel/Beschreibung
-- zu durchsuchen: "Akku laden" soll ein Video namens "12 V Batterien laden"
-- finden, auch wenn "Akku" im Titel gar nicht vorkommt.

create table if not exists tipp (
  id            uuid primary key default gen_random_uuid(),
  titel         text not null,
  beschreibung  text not null default '',
  schlagworte   text not null default '',
  video_url     text not null,
  video_typ     text not null,
  erstellt_von  text not null,
  erstellt_am   timestamptz not null default now()
);

create index if not exists tipp_erstellt_am on tipp (erstellt_am desc);
