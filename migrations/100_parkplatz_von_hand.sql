-- VIP-Parkplätze von Hand eintragen (Florian, 29.09.2026).
--
-- Bisher kamen die Parkplätze ausschließlich aus dem Ticketshop, über eine
-- Google-Tabelle, in die nur der Shop schreibt. Es gibt aber zwei Fälle
-- ohne Shop-Buchung:
--
--   - Am Telefon gebucht.
--   - Jemandem einen Platz schenken, etwa einem Stammgast.
--
-- Genau wie bei den Geschenken für Abbrecher steht so ein Eintrag hier in
-- unserer Datenbank, nicht in der Tabelle des Shops: Dort haben wir kein
-- Schreibrecht, und die Tabelle soll die Quelle des Shops bleiben.
--
-- Das Schild wird für einen Eintrag von Hand genauso gedruckt wie für eine
-- Buchung. Auf dem Parkplatz sieht man dem Auto nicht an, wie es gebucht
-- wurde.

begin;

create table if not exists parkplatz_hand (
  id           uuid primary key default gen_random_uuid(),
  -- Der Abend, für den der Platz gilt. Ein Parkplatz gehört zum Tag, nicht
  -- zur einzelnen Vorstellung: Das Auto steht an einem Abend nur einmal da.
  datum        date not null,
  name         text not null,
  email        text not null default '',
  anzahl       int  not null default 1 check (anzahl > 0 and anzahl <= 20),
  -- Warum, nur intern: "telefonisch gebucht", "Geschenk für Stammgast".
  notiz        text not null default '',
  erfasst_von  text not null default '',
  erstellt_am  timestamptz not null default now()
);

create index if not exists parkplatz_hand_datum on parkplatz_hand (datum);

commit;
