-- Der Personalbogen wird jetzt aufbewahrt (Florian, 01.10.2026).
--
-- Bisher ging er nur als Mail ans Lohnbüro und war danach im Haus nicht
-- mehr greifbar. Jeder, der etwas daraus brauchte, musste den Mitarbeiter
-- noch einmal fragen: "wenn kein fragebogen im eventmanager hinterlegt
-- ist, hinterlegst du die infos hieraus (bitte selber eintragen und
-- mitarbeiter dann auch nicht mehr fragen)".
--
-- Die Angaben sind heikel: Sozialversicherungsnummer, Steuer-ID, IBAN.
-- Sie liegen deshalb hinter derselben Schranke wie die Arbeitsverträge,
-- also nur für Werner, Kevin und Florian, und jeder sieht seinen eigenen.

create table if not exists personalbogen (
  benutzer_id  uuid primary key references benutzer (id) on delete cascade,
  daten        jsonb not null,
  -- Woher die Angaben stammen: "selbst ausgefüllt" oder der Papierbogen.
  quelle       text not null default '',
  erfasst_von  text not null default '',
  erfasst_am   timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

-- Verträge, die auf Papier geschlossen wurden, bevor es den Eventmanager
-- gab. Sie werden hier nur festgehalten, nicht neu unterschrieben: Es gibt
-- sie schon, mit Unterschrift, auf Papier.
alter table arbeitsvertrag add column if not exists auf_papier boolean not null default false;
alter table arbeitsvertrag add column if not exists quelle text not null default '';
