-- Rechnungsstatus und Zahlungsabgleich (Florian, 22.09.2026).
--
-- Bisher gab es Rechnungen nur für den Magicuvée (wein_rechnung) und
-- Zahlungen je Vorgang (zahlung). Was fehlte: ein Ort, an dem jede
-- Rechnung mit ihrem Stand steht, und der Abgleich mit dem Bankkonto.
--
-- Vier Tabellen, mit Absicht getrennt:
--
--  rechnung          Eine Rechnung mit Betrag, Fälligkeit und Versandstand.
--  rechnung_zahlung  Jede einzelne Zahlung darauf. Teilzahlungen bleiben
--                    damit sichtbar, statt einen Betrag zu überschreiben.
--  bank_umsatz       Was auf dem Konto gebucht wurde, einmal je Buchung.
--                    Der Schlüssel fingerabdruck verhindert Dubletten,
--                    auch wenn die Bank dieselbe Buchung erneut liefert.
--  rechnung_ereignis Der Verlauf: erstellt, versendet, bezahlt, geändert.
--                    Wird nur angehängt, nie geändert.
--
-- Die Bankzugangsdaten stehen nirgends in der Datenbank. Der Abruf läuft
-- ausserhalb (siehe scripts/bank-abruf.py) und liefert nur die gebuchten
-- Umsätze. Geschrieben wird beim Konto nichts, gelesen nur.

create table if not exists rechnung (
  id               uuid primary key default gen_random_uuid(),
  nummer           text not null unique,
  -- Woher sie kommt: 'magicuvee', 'vorgang', 'frei'.
  quelle           text not null default 'frei',
  vorgang_id       uuid references vorgang (id) on delete set null,
  wein_rechnung_id uuid references wein_rechnung (id) on delete set null,

  kunde            text not null,
  kunde_email      text not null default '',
  -- IBAN des Kunden, sobald sie einmal aus einer Zahlung bekannt ist.
  kunde_iban       text not null default '',

  betrag_cent      int not null,
  waehrung         text not null default 'EUR',
  rechnungsdatum   date not null default current_date,
  zahlungsziel_tage int not null default 14,
  faellig_am       date not null,
  leistung         text not null default '',

  -- DRAFT CREATED SENT DUE OVERDUE PARTIALLY_PAID PAID CANCELLED
  status           text not null default 'CREATED'
                   check (status in ('DRAFT','CREATED','SENT','DUE','OVERDUE','PARTIALLY_PAID','PAID','CANCELLED')),

  -- Versand: gilt erst als versendet, wenn die Mail wirklich rausging.
  versendet_am     timestamptz,
  versendet_an     text,
  mail_id          text,
  mail_status      text not null default 'offen'
                   check (mail_status in ('offen','gesendet','fehlgeschlagen')),
  mail_fehler      text,

  bezahlt_am       timestamptz,
  storniert_am     timestamptz,
  storniert_grund  text,
  notiz            text not null default '',
  erstellt_am      timestamptz not null default now(),
  erstellt_von     text,
  geaendert_am     timestamptz not null default now()
);

create index if not exists rechnung_status on rechnung (status, faellig_am);
create index if not exists rechnung_nummer on rechnung (nummer);

-- Die Umsätze des Geschäftskontos. Nur gebuchte, nur lesend geholt.
create table if not exists bank_umsatz (
  id             uuid primary key default gen_random_uuid(),
  -- Stabiler Fingerabdruck der Buchung, damit nichts doppelt ankommt.
  fingerabdruck  text not null unique,
  bank_referenz  text,
  buchungstag    date not null,
  wertstellung   date,
  betrag_cent    int not null,
  waehrung       text not null default 'EUR',
  gegenname      text not null default '',
  gegen_iban     text not null default '',
  verwendungszweck text not null default '',
  roh            jsonb,
  importiert_am  timestamptz not null default now(),
  -- offen, zugeordnet, ignoriert
  stand          text not null default 'offen' check (stand in ('offen','zugeordnet','ignoriert')),
  ignoriert_grund text
);

create index if not exists bank_umsatz_stand on bank_umsatz (stand, buchungstag desc);
create index if not exists bank_umsatz_tag on bank_umsatz (buchungstag desc);

-- Jede Zahlung auf eine Rechnung, ob von der Bank oder von Hand.
create table if not exists rechnung_zahlung (
  id             uuid primary key default gen_random_uuid(),
  rechnung_id    uuid not null references rechnung (id) on delete cascade,
  bank_umsatz_id uuid references bank_umsatz (id) on delete set null,
  betrag_cent    int not null,
  datum          date not null,
  art            text not null default 'ueberweisung',
  -- 'automatisch' über den Bankabgleich, 'manuell' von Hand eingetragen.
  herkunft       text not null default 'automatisch' check (herkunft in ('automatisch','manuell')),
  notiz          text not null default '',
  erfasst_am     timestamptz not null default now(),
  erfasst_von    text,
  unique (rechnung_id, bank_umsatz_id)
);

create index if not exists rechnung_zahlung_rechnung on rechnung_zahlung (rechnung_id);

-- Der Verlauf je Rechnung. Wird nur ergänzt, nie geändert.
create table if not exists rechnung_ereignis (
  id          uuid primary key default gen_random_uuid(),
  rechnung_id uuid references rechnung (id) on delete cascade,
  zeitpunkt   timestamptz not null default now(),
  art         text not null,
  text        text not null,
  wer         text not null default 'System',
  vorher      jsonb,
  nachher     jsonb
);

create index if not exists rechnung_ereignis_rechnung on rechnung_ereignis (rechnung_id, zeitpunkt);

-- Stand der Bankanbindung: wann zuletzt geholt wurde und ob die Bank eine
-- neue Freigabe verlangt.
create table if not exists bank_stand (
  id               int primary key default 1 check (id = 1),
  konto_endet_auf  text not null default '2019',
  bank             text not null default 'Volksbank Allgäu-Oberschwaben',
  bic              text not null default 'GENODES1LEU',
  zuletzt_am       timestamptz,
  zuletzt_umsaetze int not null default 0,
  bis_datum        date,
  freigabe_noetig  boolean not null default false,
  letzter_fehler   text,
  -- Standard-Zahlungsziel in Tagen für neue Rechnungen.
  zahlungsziel_tage int not null default 14
);

insert into bank_stand (id) values (1) on conflict (id) do nothing;
