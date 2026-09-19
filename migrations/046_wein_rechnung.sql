-- Monatsrechnung für den Magicuvée an die Gastro (Florian, 19.09.2026).
--
-- Die Rechnung selbst entsteht in Lexware Office (lexoffice): Dort liegen
-- Nummernkreis, GoBD-Archiv, E-Rechnung und der Abgleich mit dem Konto.
-- Der Eventmanager stößt sie an, verschickt sie mit einer eigenen Mail und
-- merkt sich, ob sie bezahlt ist.

create table if not exists wein_rechnung (
  id                 uuid primary key default gen_random_uuid(),
  monat              text not null unique,        -- 2026-09
  empfaenger         jsonb not null,
  netto_cent         int not null,
  ust_cent           int not null,
  brutto_cent        int not null,
  lexoffice_id       text,
  nummer             text,
  erstellt_am        timestamptz not null default now(),
  erstellt_von       text not null,
  versendet_am       timestamptz,
  versendet_an       text[] not null default '{}',
  -- Stand in lexoffice: open, paid, paidoff, voided, overdue ...
  status             text not null default 'open',
  status_geprueft_am timestamptz,
  bezahlt_am         timestamptz
);

alter table wein_einstellung add column if not exists rechnung_empfaenger jsonb not null default
  '{"name": "OK Magic Taste GmbH", "strasse": "Grethe-Weiser-Str. 2/1", "plz": "89231", "ort": "Neu-Ulm"}';
alter table wein_einstellung add column if not exists rechnung_an text[] not null default
  array['mail@zurforelleulm.de', 'kevin.steele@florianzimmer.com', 'w.zimmer@florianzimmer.com'];
-- Erst an, wenn Florian die erste Rechnung gesehen hat.
alter table wein_einstellung add column if not exists rechnung_automatisch boolean not null default false;
alter table wein_einstellung add column if not exists zahlungsziel_tage int not null default 14;
