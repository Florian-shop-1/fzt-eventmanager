-- Die Bewertungsmail nach einer Firmenveranstaltung (25.09.2026).
--
-- Gaeste aus dem Shop bekommen sie schon: am Morgen nach der Show, fuenf
-- Sterne zum Anklicken, ab vier geht es weiter zu Google und Tripadvisor.
-- Firmenkunden bekamen bisher nichts, dabei sind sie die Kunden, deren
-- Empfehlung am schwersten wiegt.
--
-- Warum eine eigene Tabelle statt einer Zeile in shop_buchung: Eine
-- Firmenveranstaltung ist keine Shop-Buchung. Sie hat keinen Warenkorb,
-- keine Zahlung im Shop und keinen einzelnen Gast, sondern einen Vorgang
-- und einen Ansprechpartner. Die Spalten heissen trotzdem wie dort,
-- damit die Bewertungsseite im Shop unveraendert bleiben kann: Sie
-- bekommt ihren Token und findet ihn hier, wenn er nicht in shop_buchung
-- steht.

begin;

create table if not exists firmen_bewertung (
  id           uuid primary key default gen_random_uuid(),
  vorgang_id   uuid not null references vorgang (id) on delete cascade,

  -- 32 Hexzeichen, wie der Token der Shop-Buchungen. Die Bewertungsseite
  -- prueft dieses Format, bevor sie ueberhaupt fragt.
  zugang_token text not null unique,

  -- Gleiche Namen wie in shop_buchung, siehe oben.
  name         text not null default '',
  email        text not null default '',
  telefon      text not null default '',
  show         text not null default '',
  datum        date,
  uhrzeit      text,

  sterne       int,
  sterne_am    timestamptz,
  kritik       text,
  kritik_am    timestamptz,
  bewertung_unterhaltung text,

  bewertung_mail_am timestamptz,
  erstellt_am  timestamptz not null default now()
);

-- Je Vorgang nur eine Anfrage.
create unique index if not exists firmen_bewertung_vorgang on firmen_bewertung (vorgang_id);

commit;
