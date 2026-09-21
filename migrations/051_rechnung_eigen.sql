-- Eigene Rechnungsnummer und eigenes PDF (Florian, 21.09.2026).
--
-- Die Nummer entsteht aus dem Erstellungsdatum plus laufender Nummer des
-- Tages: RE-2026-10-01-01. Damit ist sie eindeutig, nachvollziehbar und
-- erfüllt die Anforderung an eine fortlaufende Rechnungsnummer.
--
-- Empfänger ist Osman, in Kopie gehen Werner, Kevin und Florian.

alter table wein_einstellung add column if not exists rechnung_kopie text[] not null default
  array['w.zimmer@florianzimmer.com', 'kevin.steele@florianzimmer.com', 'info@florianzimmer.com'];

-- Pflichtangaben des Absenders nach § 14 UStG. Steuernummer, USt-IdNr. und
-- Bankverbindung trägt Florian selbst ein, ohne sie geht keine Rechnung raus.
alter table wein_einstellung add column if not exists absender jsonb not null default '{
  "firma": "Florian Zimmer Theater GmbH",
  "strasse": "Grethe-Weiser-Str. 2/1",
  "plz": "89231",
  "ort": "Neu-Ulm",
  "telefon": "0731 7906110",
  "email": "info@florianzimmer.com",
  "web": "florianzimmertheater.de",
  "steuernummer": "",
  "ustId": "",
  "iban": "",
  "bic": "",
  "bank": "",
  "geschaeftsfuehrer": "Florian Zimmer",
  "registergericht": "Amtsgericht Ulm, HRB 725879"
}'::jsonb;

alter table wein_rechnung add column if not exists pdf bytea;
alter table wein_rechnung add column if not exists positionen jsonb;
alter table wein_rechnung add column if not exists absender jsonb;
alter table wein_rechnung add column if not exists leistungszeitraum text not null default '';

-- Osman bekommt die Rechnung, die anderen eine Kopie.
update wein_einstellung set rechnung_an = array['mail@zurforelleulm.de'] where id = 1;
