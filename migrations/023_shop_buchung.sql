-- Buchungen aus dem öffentlichen Ticketshop, mit einzelnen Posten.
--
-- Warum das nötig ist: Wir können Ditix nicht fragen, wer was gebucht hat, es
-- gibt dafür keine Schnittstelle. Der Shop schickt aber ohnehin bei JEDER
-- Übergabe zur Kasse ein vollständiges Paket an Make. Diese Daten schreiben
-- wir hier zusätzlich mit, dann haben wir sie selbst.
--
-- Zweck: eine Woche vor der Show gezielt anschreiben und genau das anbieten,
-- was noch NICHT gebucht wurde. Menü, VIP-Armband, Stehtisch in der Pause,
-- Bundles zum Nachzaubern.
--
-- Warum einzelne Posten statt Fließtext: Der bestehende Make-Weg schickt den
-- Warenkorb als Text ("Kat 1 x2 (99€), 4-Gang-Menü CLASSIC x2 (69€)"). Für
-- einen Menschen am Telefon reicht das. Für die Frage "hat kein Menü" nicht:
-- Man müsste nach Wörtern wie "Menü" suchen, und beim ersten umbenannten
-- Produkt mailt man Gästen ein Menü an, das sie längst haben. Das ist
-- schlimmer als gar keine Mail. Deshalb je Posten eine eigene Zeile mit
-- stabiler Produkt-Kennung und Gruppe.
--
-- Löst shop_hinweis ab (Migration 021). Die Unverträglichkeit ist hier nur ein
-- Feld der Buchung; sie brauchte nie eine eigene Tabelle. Die vorhandenen
-- Zeilen werden unten übernommen, damit im Funktionsheet nichts verloren geht.

create table if not exists shop_buchung (
  id               uuid        primary key default gen_random_uuid(),
  -- Warenkorb-Kennung des Shops. Über sie fragen wir beim Shop nach, ob
  -- wirklich bezahlt wurde (/api/ditix/checkout/status).
  cart_id          text,
  ditix_event_id   text        not null,
  datum            date        not null,
  uhrzeit          text,
  show             text        not null default '',
  email            text        not null default '',
  telefon          text        not null default '',
  plaetze          int,
  gesamt_cent      int,
  -- Freitext des Gastes aus dem Menü-Schritt (Unverträglichkeiten).
  hinweis          text        not null default '',
  -- Gespeichert wird beim Übergang zur Kasse, also BEVOR bezahlt ist. Nur was
  -- hier auf true steht, ist eine echte Buchung. Wer wegen des Preises
  -- abbricht, darf weder in der Küchenliste noch in einer Werbemail landen.
  bestaetigt       boolean     not null default false,
  access_code      text,
  zuletzt_geprueft timestamptz,
  -- Wann die Vorfreude-Mail rausging. NULL heißt: noch nicht verschickt.
  -- Verhindert doppelte Mails, auch wenn der Versand mehrfach angestoßen wird.
  mail_gesendet_am timestamptz,
  eingegangen_am   timestamptz not null default now()
);

create index if not exists shop_buchung_datum on shop_buchung (datum);
-- Ein Warenkorb soll nicht mehrfach auftauchen, wenn der Shop es erneut
-- versucht. Mehrere leere Werte gelten in Postgres als verschieden, das ist
-- hier richtig: ohne Kennung können wir Dubletten nicht erkennen.
create unique index if not exists shop_buchung_cart on shop_buchung (cart_id);

create table if not exists shop_buchung_posten (
  id             uuid    primary key default gen_random_uuid(),
  buchung_id     uuid    not null references shop_buchung (id) on delete cascade,
  -- Kennung des Ticket-Typs in Ditix. Stabil, auch wenn jemand den Namen ändert.
  ticket_type_id text    not null default '',
  name           text    not null default '',
  anzahl         int     not null default 0,
  preis_cent     int,
  -- 'sitzplatz', 'menue', 'vip' oder 'bundle'. Der Shop kennt diese Einteilung
  -- bereits aus dem Buchungsablauf (Schritt 3, 4 und 5) und schickt sie mit,
  -- statt dass wir sie hier aus Namen erraten.
  gruppe         text    not null default ''
);

create index if not exists shop_buchung_posten_buchung on shop_buchung_posten (buchung_id);
create index if not exists shop_buchung_posten_gruppe on shop_buchung_posten (gruppe);

-- Vorhandene Hinweise aus Migration 021 übernehmen, damit im Funktionsheet
-- nichts verschwindet. Posten gibt es dort nicht, die Buchungen bleiben also
-- ohne Positionen. Für die Küche zählt ohnehin nur der Hinweis.
insert into shop_buchung
  (cart_id, ditix_event_id, datum, uhrzeit, show, email, telefon, plaetze,
   hinweis, bestaetigt, access_code, zuletzt_geprueft, eingegangen_am)
select cart_id, ditix_event_id, datum, uhrzeit, show, email, telefon, plaetze,
       hinweis, bestaetigt, access_code, zuletzt_geprueft, eingegangen_am
  from shop_hinweis
 where not exists (
   select 1 from shop_buchung b
    where b.cart_id is not distinct from shop_hinweis.cart_id
      and b.cart_id is not null
 );
