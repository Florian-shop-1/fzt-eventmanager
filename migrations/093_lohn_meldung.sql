-- Die Stundenmeldung ans Steuerbüro (Florian, 29.09.2026).
--
-- Werner schaut sich die Stunden eines Zeitraums an, bestätigt sie und
-- schickt sie an Frau Buschow. Zwei Schritte, nicht einer: Solange wir
-- testen, soll nichts von allein hinausgehen.
--
-- Festgehalten wird auch, welche Zahlen verschickt wurden. Wenn später
-- jemand einen Stempel nachträgt, ändert sich die Auswertung; was Frau
-- Buschow bekommen hat, darf sich davon nicht rückwirkend ändern.

begin;

create table if not exists lohn_meldung (
  -- Der Zeitraum, benannt nach seinem Endmonat: '2026-10' läuft vom
  -- 16.09. bis 15.10.
  zeitraum       text primary key,
  bestaetigt_am  timestamptz,
  bestaetigt_von text,
  versendet_am   timestamptz,
  versendet_an   text,
  -- Die Summen, wie sie beim Versand aussahen.
  stand          jsonb
);

create table if not exists lohn_einstellung (
  id             int primary key default 1 check (id = 1),
  -- Die Adresse des Steuerbüros. Leer, bis Florian sie einträgt: Eine
  -- geratene Adresse wäre schlimmer als gar keine, denn dort stehen
  -- Namen und Arbeitszeiten drin.
  steuerbuero       text not null default '',
  steuerbuero_name  text not null default 'Steuerbüro',
  -- Eine stille Kopie ins Haus, damit nachvollziehbar bleibt, was raus ist.
  kopie_an          text not null default ''
);

insert into lohn_einstellung (id) values (1) on conflict (id) do nothing;

commit;
