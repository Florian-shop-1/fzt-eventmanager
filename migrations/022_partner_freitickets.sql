-- Partner mit Freiticket-Kontingent (Hotels, Multiplikatoren).
--
-- Ein Partner verkauft ein eigenes Paket und legt einen unserer Ditix-
-- Freiticket-Codes bei. Der Gast bucht bei uns Termin und Platz und setzt das
-- Ticket an der Kasse mit dem Code auf null. Abgerechnet wird monatlich.
--
-- Warum wir hier eine ABLESUNG speichern und nicht die einzelnen Codes:
-- Ditix zeigt pro Code-Satz nur "Anzahl eingelöster Codes", und dieser Zähler
-- läuft seit Beginn kumulativ hoch. Für eine Monatsrechnung braucht es also
-- immer die Differenz zum Vormonat. Genau das ist eine Ablesung, wie beim
-- Stromzähler. Wer nur den aktuellen Stand abrechnet, stellt jeden Monat alles
-- noch einmal in Rechnung.
--
-- Sobald Ditix die Einlösungen über eine Schnittstelle herausgibt, füllt sich
-- dieselbe Tabelle automatisch statt von Hand. Die Rechnungslogik bleibt.

create table if not exists partner (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  -- Name des Code-Satzes in Ditix, damit klar ist, welcher Zähler gemeint ist.
  ditix_aktion      text        not null default '',
  -- Was wir dem Partner pro eingelöstem Code berechnen, in Cent.
  preis_je_code_cent int        not null default 0,
  -- Wie viele Codes wir insgesamt herausgegeben haben. Nur zur Kontrolle.
  codes_ausgegeben  int,
  aktiv             boolean     not null default true,
  notiz             text,
  erstellt_am       timestamptz not null default now()
);

create table if not exists partner_ablesung (
  id            uuid        primary key default gen_random_uuid(),
  partner_id    uuid        not null references partner (id) on delete cascade,
  -- Tag, an dem in Ditix abgelesen wurde.
  stichtag      date        not null,
  -- Der in Ditix angezeigte Gesamtstand an diesem Tag (kumulativ).
  stand_gesamt  int         not null,
  notiz         text,
  erfasst_am    timestamptz not null default now(),
  erfasst_von   text
);

-- Pro Partner und Stichtag nur eine Ablesung. Ein zweites Ablesen am selben
-- Tag korrigiert die erste, statt eine Dublette anzulegen.
create unique index if not exists partner_ablesung_eindeutig
  on partner_ablesung (partner_id, stichtag);

create index if not exists partner_ablesung_partner
  on partner_ablesung (partner_id, stichtag desc);
