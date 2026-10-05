-- Welches Parkplatzschild schon gedruckt ist.
--
-- Gedruckt wird am Tag vor der Show. Kommt einer am Showtag dazu, soll er
-- auffallen, und vor allem soll niemand den ganzen Stapel noch einmal
-- drucken, nur weil er nicht weiss, was der Kollege gestern schon gemacht
-- hat (Florian, 05.10.2026).
--
-- Ein Eintrag je Buchung und Tag. Die Buchung kommt entweder aus dem Shop
-- (ihre Bestellnummer) oder von Hand ("hand:<id>"), beides steht hier als
-- Text.
create table if not exists parkplatz_gedruckt (
  datum        date not null,
  order_id     text not null,
  gedruckt_von text not null default '',
  gedruckt_am  timestamptz not null default now(),
  primary key (datum, order_id)
);

create index if not exists parkplatz_gedruckt_datum on parkplatz_gedruckt (datum);
