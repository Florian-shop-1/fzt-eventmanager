-- Geschenke von Hand eintragen (Florian, 29.09.2026).
--
-- Bisher entstand ein Geschenk nur aus einem abgebrochenen Warenkorb.
-- Es gibt aber zwei Fälle, in denen jemand etwas bekommen soll, ohne dass
-- eine Buchung im Shop dazu existiert:
--
--   - Jemandem soll einfach etwas Gutes getan werden.
--   - Der Abend wurde telefonisch gebucht, also gar nicht über den Shop.
--
-- Solche Geschenke haben keine Shop-Buchung, an der der Abend hängt.
-- Deshalb stehen Show, Datum und Uhrzeit hier direkt am Geschenk, damit
-- das Foyer sie am richtigen Abend in der Liste findet.

begin;

alter table abbruch_geschenk add column if not exists von_hand boolean not null default false;
alter table abbruch_geschenk add column if not exists erfasst_von text not null default '';
alter table abbruch_geschenk add column if not exists hand_show text;
alter table abbruch_geschenk add column if not exists hand_datum date;
alter table abbruch_geschenk add column if not exists hand_uhrzeit text;

-- Ohne Shop-Buchung gibt es oft keine Mailadresse, etwa am Telefon.
alter table abbruch_geschenk alter column email drop not null;
alter table abbruch_geschenk alter column email set default '';

create index if not exists abbruch_geschenk_hand on abbruch_geschenk (hand_datum) where von_hand;

commit;
