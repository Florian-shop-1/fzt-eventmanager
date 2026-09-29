-- Zu jeder Abbuchung der passende Beleg (Florian, 29.09.2026).
--
-- Die Kreditkartenabrechnung kommt als ein einziger Betrag aufs Konto.
-- Dahinter stecken Bewirtungen, Meta, Werbeanzeigen und was sonst noch
-- mit der Karte bezahlt wurde. Fuers Finanzamt braucht jede dieser
-- Ausgaben einen Beleg, und bisher war das Suchen Handarbeit: Liste
-- durchgehen, Beleg suchen, abhaken.
--
-- Das Programm kann das fast vollstaendig: Es kennt die Umsaetze und es
-- kennt die gescannten Belege. Betrag und Datum passen zusammen oder
-- nicht. Uebrig bleibt nur, was wirklich fehlt.
--
-- Drei Zustaende hat eine Ausgabe:
--   offen       noch kein Beleg da
--   beleg       einem gescannten Beleg zugeordnet
--   kein_beleg  braucht keinen, etwa Loehne, Miete, Steuern
--
-- Wiederkehrendes wie die Stromrechnung oder die Loehne soll man nicht
-- jeden Monat neu abhaken. Dafuer gibt es Regeln auf den Namen des
-- Empfaengers.

begin;

alter table bank_umsatz add column if not exists beleg_id uuid references bewirtung (id) on delete set null;
alter table bank_umsatz add column if not exists beleg_stand text not null default 'offen'
  check (beleg_stand in ('offen', 'beleg', 'kein_beleg'));
alter table bank_umsatz add column if not exists beleg_notiz text not null default '';
alter table bank_umsatz add column if not exists beleg_wer text not null default '';
alter table bank_umsatz add column if not exists beleg_am timestamptz;

create index if not exists bank_umsatz_beleg on bank_umsatz (beleg_stand, buchungstag desc);

-- Was nie einen Beleg braucht, erkannt am Namen des Empfaengers.
create table if not exists beleg_regel (
  id          uuid primary key default gen_random_uuid(),
  -- Teil des Empfaengernamens, klein geschrieben verglichen.
  muster      text not null,
  grund       text not null default '',
  erstellt_am timestamptz not null default now(),
  erstellt_von text not null default ''
);

create unique index if not exists beleg_regel_muster on beleg_regel (lower(muster));

-- Ein Beleg kann nur zu einer Abbuchung gehoeren. Sonst wuerde derselbe
-- Beleg zwei Ausgaben rechtfertigen, und genau das faellt bei einer
-- Pruefung auf.
create unique index if not exists bank_umsatz_beleg_einmal on bank_umsatz (beleg_id) where beleg_id is not null;

commit;
