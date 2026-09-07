-- Unverträglichkeiten und Hinweise aus dem öffentlichen Ticketshop.
--
-- Bisher landeten diese Notizen nur in einer Google-Tabelle bei Make ("Waren-
-- korbabbrecher – zum Anrufen"). Im Funktionsheet standen ausschließlich die
-- Angaben aus dem Firmenevent-Weg (gruppe.unvertraeglichkeiten). Schrieb ein
-- normaler Gast beim Menü "Nussallergie" dazu, erfuhr die Küche davon nichts.
--
-- Bewusst NICHT an vorstellung.id gehängt: Diese Tabelle hat nur für Abende
-- mit Firmenevent überhaupt eine Zeile, Shop-Buchungen gibt es aber an jedem
-- Abend. Wir speichern deshalb Datum und Uhrzeit direkt und verknüpfen im
-- Funktionsheet über das Datum. Die Ditix-Kennung steht zusätzlich drin, damit
-- später ohne Datenverlust exakter zugeordnet werden kann.
--
-- Wir speichern hier absichtlich nur, was die Küche und der Rückruf brauchen.
-- Kein Name, keine Adresse, keine Zahlungsdaten.

create table if not exists shop_hinweis (
  id              uuid        primary key default gen_random_uuid(),
  -- Kennung des Termins in Ditix, so wie der Shop sie kennt.
  ditix_event_id  text        not null,
  datum           date        not null,
  uhrzeit         text,
  show            text        not null default '',
  -- Kontakt, damit die Küche oder das Team bei Unklarheiten zurückfragen kann.
  email           text        not null default '',
  telefon         text        not null default '',
  -- Der Freitext des Gastes aus dem Menü-Schritt.
  hinweis         text        not null,
  plaetze         int,
  -- Warenkorb-Kennung des Shops, für den Abgleich mit der Bestellung.
  cart_id         text,
  eingegangen_am  timestamptz not null default now()
);

-- Das Funktionsheet fragt immer nach einem Tag.
create index if not exists shop_hinweis_datum on shop_hinweis (datum);

-- Ein Warenkorb soll nicht mehrfach auftauchen, wenn der Shop es erneut
-- versucht (z.B. nach einem Netzwerkfehler). Ohne cart_id greift der Index
-- nicht, mehrere leere Werte gelten in Postgres als verschieden -- genau
-- richtig, denn ohne Warenkorb-Kennung können wir Dubletten nicht erkennen.
create unique index if not exists shop_hinweis_cart on shop_hinweis (cart_id);
