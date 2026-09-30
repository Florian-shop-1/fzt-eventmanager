-- Welche Abrechnungen und Auszüge schon eingelesen wurden.
--
-- Die Umsätze selbst können nicht doppelt hereinkommen, dafür sorgt ihr
-- Fingerabdruck. Der Mensch davor weiss davon aber nichts: Er lädt im
-- Zweifel dieselbe Datei noch einmal hoch und sieht danach "0 neue
-- Umsätze", ohne zu verstehen, warum (Florian, 30.09.2026).
--
-- Deshalb wird hier jede eingelesene Datei vermerkt. Wer dieselbe noch
-- einmal hochlädt, bekommt gesagt, dass sie schon da ist, seit wann und
-- was drinstand.

create table if not exists kontoauszug_datei (
  id uuid primary key default gen_random_uuid(),
  -- Fingerabdruck des Dateiinhalts, nicht des Namens: Dieselbe
  -- Abrechnung wird gern zweimal unter verschiedenen Namen gespeichert.
  hash text not null,
  dateiname text not null default '',
  -- Letzte vier Stellen des Kontos bzw. der Karte.
  konto text not null default '',
  -- Zeitraum der enthaltenen Umsätze.
  von_datum date,
  bis_datum date,
  umsaetze integer not null default 0,
  neu integer not null default 0,
  wer text not null default '',
  angelegt_am timestamptz not null default now()
);

create unique index if not exists kontoauszug_datei_hash on kontoauszug_datei (hash);
create index if not exists kontoauszug_datei_zeit on kontoauszug_datei (angelegt_am desc);
