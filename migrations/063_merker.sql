-- Merkzettel: Dinge, an die das Programm hin und wieder erinnern soll
-- (Florian, 21.09.2026).
--
-- Gedacht fuer das, was liegen bleibt, weil es von aussen abhaengt: einen
-- Zugang besorgen, beim Steuerbuero nachfragen, eine Nummer eintragen.
-- Jeder Eintrag gehoert einer Person und meldet sich ab "wieder_am".
-- Wird er gezeigt, schiebt das Programm das naechste Mal ein paar Tage
-- nach hinten: erinnern ja, nerven nein.

create table if not exists merker (
  id          uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references benutzer (id) on delete cascade,
  -- Fester Schluessel je Sache, damit nichts doppelt angelegt wird.
  schluessel  text not null,
  titel       text not null,
  text        text not null default '',
  link        text,
  wieder_am   date not null default current_date,
  erledigt_am timestamptz,
  angelegt_am timestamptz not null default now(),
  unique (benutzer_id, schluessel)
);

create index if not exists merker_faellig on merker (benutzer_id, wieder_am);

-- Der erste Eintrag: Zugang zum Ditix-Backend, damit die Namen der Gaeste
-- von selbst im Saalplan stehen.
insert into merker (benutzer_id, schluessel, titel, text, link)
select id, 'ditix-backend',
       'Zugang zum Ditix-Backend besorgen',
       'Damit im Saalplan automatisch steht, wer welchen Platz gebucht hat. Über den öffentlichen Weg liefert Ditix nur, welcher Platz verkauft ist, nicht an wen. Heiko fragen, ob es dafür einen Zugang oder eine Schnittstelle gibt.',
       '/upgrades'
  from benutzer where lower(email) = 'info@florianzimmer.com'
on conflict (benutzer_id, schluessel) do nothing;
