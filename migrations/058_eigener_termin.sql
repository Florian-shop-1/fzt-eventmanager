-- Eigene Termine ohne Ticketshop (Florian, 21.09.2026).
--
-- Manchmal ist das Haus exklusiv gebucht: Eine Firma mietet das Theater,
-- es gibt keine Karten im Shop und damit auch keinen Eintrag in Ditix.
-- Trotzdem brauchen Kueche, Foyer, Sitzplan und Dienstplan diesen Tag.
--
-- Solche Termine legen nur Florian und Kevin an. Sie bekommen eine eigene
-- Kennung ("eigen-..."), die im Programm genauso benutzt wird wie eine
-- Ditix-Kennung. So laeuft alles Weitere ohne Sonderfall.

create table if not exists eigener_termin (
  id           uuid primary key default gen_random_uuid(),
  -- Wird ueberall als ditix_event_id verwendet, beginnt mit "eigen-".
  event_id     text not null unique,
  datum        date not null,
  uhrzeit      text not null default '20:00',
  name         text not null,
  notiz        text not null default '',
  aktiv        boolean not null default true,
  angelegt_von text,
  angelegt_am  timestamptz not null default now()
);

create index if not exists eigener_termin_datum on eigener_termin (datum);
