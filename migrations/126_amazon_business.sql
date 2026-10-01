-- Rechnungen direkt aus Amazon Business (Florian, 01.10.2026).
--
-- Bisher musste jemand bei Amazon im Konto nachsehen und jede Rechnung
-- einzeln herunterladen, weil ein privates Amazon-Konto keine Rechnung an
-- die Mail haengt. Mit einem Amazon-Business-Konto gibt es dafuer eine
-- Schnittstelle: die Reconciliation-API nennt die Rechnungen, die
-- Document-API gibt das PDF heraus.
--
-- Die Belege landen in derselben Tabelle wie alle anderen, mit
-- herkunft = 'amazon_business'. Es gibt keine zweite Belegverwaltung.

-- Woher der Beleg kommt, steht schon in bewirtung.herkunft ('foto',
-- 'mail'). Dazu kommt jetzt 'amazon_business'. Was aus einer
-- Amazon-Rechnung stammt, bringt ein paar eigene Felder mit.
alter table bewirtung add column if not exists amazon_order_id text not null default '';
alter table bewirtung add column if not exists amazon_rechnungsnummer text not null default '';
-- 'rechnung' oder 'gutschrift'
alter table bewirtung add column if not exists amazon_dokumenttyp text not null default '';
alter table bewirtung add column if not exists netto_cent int;
alter table bewirtung add column if not exists verkaeufer text not null default '';

-- Dieselbe Rechnung nie zweimal, auch wenn der Abgleich oefter laeuft.
create unique index if not exists bewirtung_amazon_rechnung
  on bewirtung (amazon_rechnungsnummer)
  where amazon_rechnungsnummer <> '' and status <> 'storniert';

/*
  Das Merkheft des Abgleichs.

  Hier steht jede Rechnung, die Amazon genannt hat, auch die, zu der es
  noch kein PDF gibt. Das ist keine zweite Belegverwaltung: Solange kein
  PDF da ist, ist es auch kein Beleg, sondern nur das Wissen, dass einer
  kommt. Sobald das PDF da ist, entsteht daraus ein ganz normaler Beleg,
  und hier steht nur noch, zu welchem.
*/
create table if not exists amazon_rechnung (
  id                uuid primary key default gen_random_uuid(),
  rechnungsnummer   text not null,
  order_id          text not null default '',
  order_line_item_id text not null default '',
  shipment_id       text not null default '',
  -- 'rechnung' oder 'gutschrift'
  dokumenttyp       text not null default 'rechnung',
  rechnungsdatum    date,
  verkaeufer        text not null default '',
  netto_cent        int,
  steuer_cent       int,
  brutto_cent       int,
  waehrung          text not null default 'EUR',
  -- 'offen' (PDF fehlt noch), 'importiert', 'fehler'
  stand             text not null default 'offen' check (stand in ('offen', 'importiert', 'fehler')),
  versuche          int not null default 0,
  letzter_fehler    text not null default '',
  beleg_id          uuid references bewirtung (id) on delete set null,
  gesehen_am        timestamptz not null default now(),
  geaendert_am      timestamptz not null default now()
);

create unique index if not exists amazon_rechnung_nummer on amazon_rechnung (rechnungsnummer);
create index if not exists amazon_rechnung_stand on amazon_rechnung (stand, gesehen_am desc);

-- Wie weit der Abgleich schon gelaufen ist, damit nicht jedes Mal alles
-- erneut geholt wird.
create table if not exists amazon_abgleich (
  id              int primary key default 1 check (id = 1),
  bis_datum       timestamptz,
  zuletzt_am      timestamptz,
  zuletzt_neu     int not null default 0,
  zuletzt_fehler  text not null default ''
);

insert into amazon_abgleich (id) values (1) on conflict (id) do nothing;
