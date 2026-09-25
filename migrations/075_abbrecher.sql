-- Abgebrochene Warenkörbe: nachfragen und zurückholen (Florian, 23.09.2026).
--
-- In 60 Tagen brachen 282 Vorgänge über 76.050 Euro ab, gegenüber 140
-- bezahlten über 13.983 Euro. Die Abbrecher haben die größeren Körbe
-- (273 Euro im Schnitt gegen 100), also Gruppen und Familien, und fast
-- alle sprangen erst bei der Übergabe an die Kasse ab.
--
-- Zwei Mails: erst die Frage, was abgehalten hat, drei Tage später das
-- Angebot mit den VIP-Bändchen. Beides nur an Leute, die im Shop
-- ausdrücklich zugestimmt haben, dass wir sie erinnern dürfen. Ohne
-- Einwilligung ist eine Werbemail an jemanden, der NICHT gekauft hat,
-- nicht zulässig: Die Ausnahme für Bestandskunden greift erst nach einem
-- Kauf.

alter table shop_buchung
  -- Das Häkchen aus dem Shop, direkt unter dem E-Mail-Feld.
  add column if not exists werbe_ok         boolean not null default false,
  add column if not exists frage_am         timestamptz,
  add column if not exists angebot_am       timestamptz,
  -- Was der Gast auf die Frage geantwortet hat.
  add column if not exists abbruch_grund    text,
  add column if not exists abbruch_grund_am timestamptz,
  add column if not exists abbruch_text     text;

create index if not exists shop_buchung_abbruch on shop_buchung (bestaetigt, eingegangen_am);
