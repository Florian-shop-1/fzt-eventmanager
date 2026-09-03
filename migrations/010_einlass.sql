-- Wer ist schon da?
--
-- Die Einlassliste soll am Abend direkt im Programm abgehakt werden, nicht
-- nur auf Papier. Zwei Leute an der Tür sehen dann denselben Stand, und
-- nach der Vorstellung ist nachvollziehbar, wer gefehlt hat.
--
-- Eigene Tabelle statt einer Spalte an der Gruppe, weil nicht jede Gruppe
-- eine Zeile in der Datenbank hat: Buchungen aus dem Webshop entstehen erst
-- beim Lesen der Verkaufsliste und heißen dort "shop-<Bestellnummer>",
-- zusammengelegte Gruppen "zusammen-<Kennung>". Der Schlüssel ist deshalb
-- der Abend zusammen mit der Kennung der Gruppe, wie der Sitzplan sie kennt.

create table if not exists einlass (
  ditix_event_id  text        not null,
  gruppe_kennung  text        not null,
  angekommen_am   timestamptz not null default now(),
  benutzer        text,
  primary key (ditix_event_id, gruppe_kennung)
);

comment on table einlass is
  'Abgehakte Ankünfte je Abend. Die Kennung ist dieselbe wie im Sitzplan, also die Gruppen-ID, shop-<Bestellnummer> oder zusammen-<Kennung>.';
