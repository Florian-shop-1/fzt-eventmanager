-- Termine ausserhalb des Hauses (Florian, 16.10.2026).
--
-- "ich werde auch im Theater Ulm gebraucht. Ich möchte, dass diese
-- Termine im Eventmanager sichtbar sind, dass ich da im Theater Ulm bin
-- (von bis Uhrzeit). Es soll nur für Kevin und mich sichtbar sein."
--
-- Gebraucht wird das nicht zum Anschauen, sondern zum Planen: Bevor eine
-- zusätzliche Show im eigenen Haus angesetzt wird, muss klar sein, ob
-- Florian an dem Abend überhaupt kann.
create table if not exists fremdtermin (
  id          uuid primary key default gen_random_uuid(),
  benutzer_id uuid references benutzer (id) on delete cascade,
  datum       date not null,
  von         text not null default '',
  bis         text not null default '',
  ort         text not null default 'Theater Ulm',
  raum        text not null default '',
  art         text not null default '',
  quelle      text not null default '',
  angelegt_am timestamptz not null default now()
);

create index if not exists fremdtermin_datum on fremdtermin (datum);
create unique index if not exists fremdtermin_einmal
  on fremdtermin (benutzer_id, datum, von, bis, raum);
