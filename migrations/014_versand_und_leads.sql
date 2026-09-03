-- Bearbeitungsstand für Versand und Anfragen.
--
-- Beide Listen liegen in Google-Tabellen, die der Shop befüllt. Dorthin
-- kann der Eventmanager nicht zurückschreiben, dafür fehlt ihm der
-- Schreibzugriff, und die Tabellen sollen auch die Quelle bleiben.
--
-- Deshalb merkt sich das Programm seinen eigenen Stand daneben. Wo hier
-- etwas steht, gilt es; wo nichts steht, gilt die Tabelle. So sehen alle
-- denselben Fortschritt, ohne dass die Quelle angetastet wird.

create table if not exists versand_stand (
  bestellnummer text        primary key,
  erledigt_am   timestamptz,
  erledigt_von  text,
  notiz         text
);

comment on table versand_stand is
  'Was der Eventmanager zum Gutscheinversand weiß. Schlüssel ist die Bestellnummer aus dem Shop.';

create table if not exists lead_stand (
  schluessel      text        primary key,
  status          text,
  kommentar       text,
  ablehnungsgrund text,
  vorgang_id      uuid references vorgang (id) on delete set null,
  geaendert_am    timestamptz not null default now(),
  geaendert_von   text
);

comment on table lead_stand is
  'Bearbeitungsstand einer Anfrage. Der Schlüssel wird aus Eingangsdatum, Mailadresse und Name gebildet, weil die Tabelle keine Nummer führt.';
comment on column lead_stand.vorgang_id is
  'Der Vorgang, der aus dieser Anfrage entstanden ist. So ist die Verbindung von der Anfrage bis zur Rechnung durchgängig.';
