-- Menüs von Hand stornieren (Florian, 02.10.2026).
--
-- "wir müssen menüs auch von Hand stornieren können im eventmanager.
-- manchmal ändert sich was - oder updatest du, wenn wir in ditix
-- storniert hatten"
--
-- Nein, das kommt nicht von selbst: Die Menübestellungen liest das
-- Programm aus der Tabelle, die der Shop schreibt. Dort bleibt eine Zeile
-- stehen, auch wenn die Buchung in Ditix später storniert wird. Die Küche
-- würde also für Gäste kochen, die abgesagt haben.
--
-- Deshalb dieser Merkzettel: Was hier steht, zählt im Küchenblatt und in
-- der Belegung nicht mehr mit. Gelöscht wird nichts, die Zeile in der
-- Tabelle bleibt, wie sie ist; der Storno steht daneben, mit Grund und
-- Namen, und lässt sich zurücknehmen.

create table if not exists menue_storno (
  id            uuid primary key default gen_random_uuid(),
  -- Die Bestellnummer aus der Shop-Tabelle.
  bestellung    text not null,
  ditix_event_id text not null default '',
  kunde         text not null default '',
  grund         text not null default '',
  wer           text not null default '',
  wann          timestamptz not null default now()
);

create unique index if not exists menue_storno_bestellung on menue_storno (bestellung);
