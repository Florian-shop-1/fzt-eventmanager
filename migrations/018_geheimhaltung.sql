-- Geheimhaltungsvereinbarungen.
--
-- Jeder, der im Haus arbeitet, muss sie unterschrieben haben. In der
-- Zauberkunst ist das keine Formalie: Wer weiss, wie ein Trick
-- funktioniert, kann ihn verraten, und dann ist er wertlos.
--
-- Bisher lag für jede Person eine eigene Word-Datei auf SharePoint, in
-- der Name, Geburtsdatum und Anschrift von Hand eingesetzt wurden. Wer
-- unterschrieben hat und wer nicht, wusste niemand ohne nachzusehen.
--
-- Hier stehen die Angaben einmal, das Papier entsteht daraus, und der
-- Stand ist auf einen Blick zu sehen.
--
-- Absichtlich getrennt von der Benutzertabelle: Nicht jeder, der
-- unterschreiben muss, hat einen Zugang zum Programm, und wer seinen
-- Zugang verliert, soll seine Unterschrift nicht mitverlieren.

create table if not exists geheimhaltung (
  id            uuid primary key default gen_random_uuid(),
  benutzer_id   uuid references benutzer(id) on delete set null,
  name          text not null,
  geburtsdatum  text not null,
  strasse       text not null,
  plz           text not null,
  ort           text not null,
  -- Wann die Angaben zuletzt geändert wurden.
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  -- Wann das unterschriebene Blatt zurückkam, und wer es abgehakt hat.
  unterschrieben_am   timestamptz,
  unterschrieben_von  text,
  notiz         text
);

comment on table geheimhaltung is
  'Geheimhaltungsvereinbarungen der Mitarbeiter: Angaben für den Ausdruck und der Stand der Unterschrift.';
comment on column geheimhaltung.benutzer_id is
  'Zugang im Programm, falls vorhanden. Leer bei Aushilfen ohne eigenen Zugang.';
comment on column geheimhaltung.unterschrieben_am is
  'Gesetzt, sobald das unterschriebene Blatt vorliegt. Leer heisst: fehlt noch.';

create unique index if not exists geheimhaltung_benutzer
  on geheimhaltung (benutzer_id) where benutzer_id is not null;
