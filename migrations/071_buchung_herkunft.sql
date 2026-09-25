-- Woher eine Buchung kam (Florian, 23.09.2026).
--
-- Eine Agentur übernimmt Google Ads, und dafür muss belegbar sein, was
-- eine Kampagne wirklich einbringt. Bisher wusste das nur Matomo, und
-- dort steht der Besuch, nicht der bezahlte Platz.
--
-- Der Shop merkt sich ohnehin schon, über welche Kampagne jemand kam
-- (localStorage, siehe lib/attribution im Shop). Ab jetzt schickt er es
-- bei jeder Übergabe zur Kasse mit, und hier steht es neben Betrag und
-- Bezahlstatus. Damit lässt sich sagen: so viele Karten und so viel
-- Umsatz kamen über Google, über Meta, über die Zeitung.
--
-- Bewusst der letzte Kontakt vor dem Kauf ("last touch"), nicht der
-- allererste Besuch: Das ist die Kampagne, die den Kauf ausgelöst hat.

alter table shop_buchung
  add column if not exists quelle   text not null default '',
  add column if not exists medium   text not null default '',
  add column if not exists kampagne text not null default '',
  add column if not exists inhalt   text not null default '',
  add column if not exists landing  text not null default '';

create index if not exists shop_buchung_quelle on shop_buchung (quelle, datum);
