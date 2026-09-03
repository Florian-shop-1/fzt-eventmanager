-- Grundgerüst des FZT Eventmanagers.
--
-- Wichtige Entscheidung: Die Vorstellung ist eine eigene Tabelle und nicht
-- ein Feld am Vorgang. An einem Abend sitzen mehrere Firmen gleichzeitig
-- im Haus, deshalb müssen Kapazität, Sitzplan und Küchenblatt pro
-- Vorstellung berechnet werden, nicht pro Vorgang.

create table if not exists benutzer (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  email         text        not null unique,
  rolle         text        not null default 'mitarbeiter',
  aktiv         boolean     not null default true,
  erstellt_am   timestamptz not null default now()
);

create table if not exists kunde (
  id                      uuid primary key default gen_random_uuid(),
  name                    text        not null,
  ansprechpartner         text,
  anrede                  text,
  email                   text        not null,
  telefon                 text,
  strasse                 text,
  plz                     text,
  ort                     text,
  lexoffice_kundennummer  text,
  lexoffice_kontakt_id    text,
  notiz                   text,
  erstellt_am             timestamptz not null default now(),
  geaendert_am            timestamptz not null default now()
);

create index if not exists kunde_name_idx on kunde (lower(name));

create table if not exists vorstellung (
  id              uuid primary key default gen_random_uuid(),
  datum           date        not null,
  show            text        not null,
  -- Kennung in Ditix, sobald die Anbindung steht.
  ditix_event_id  text,
  -- Abweichende Kapazität, falls an einem Abend etwas umgebaut wird.
  -- NULL bedeutet: Standardkapazität aus venue.ts verwenden.
  logen_plaetze          int,
  eventgalerie_plaetze   int,
  notiz           text,
  erstellt_am     timestamptz not null default now(),
  unique (datum, show)
);

create table if not exists vorgang (
  id              uuid primary key default gen_random_uuid(),
  nummer          text        not null unique,
  status          text        not null default 'anfrage',
  kunde_id        uuid        not null references kunde (id) on delete restrict,
  vorstellung_id  uuid        not null references vorstellung (id) on delete restrict,
  quelle          text,
  betreuer_id     uuid        references benutzer (id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now()
);

create index if not exists vorgang_status_idx on vorgang (status);
create index if not exists vorgang_vorstellung_idx on vorgang (vorstellung_id);

-- Eine Buchungsgruppe: Menschen, die zusammen sitzen wollen.
create table if not exists gruppe (
  id                    uuid primary key default gen_random_uuid(),
  vorgang_id            uuid        not null references vorgang (id) on delete cascade,
  name                  text        not null,
  personen              int         not null check (personen > 0),
  herkunft              text        not null default 'firma',
  -- Menüwahl je Variante, zum Beispiel {"classic": 8, "veggy": 2}
  menues                jsonb       not null default '{}'::jsonb,
  unvertraeglichkeiten  text,
  -- 'logen', 'eventgalerie' oder NULL für den Vorschlag des Planers
  bereich_fixiert       text,
  -- Ausnahme vom Aufschlag für nicht belegte Logenplätze
  ausnahme_aktiv        boolean     not null default false,
  ausnahme_grund        text,
  ausnahme_benutzer     text,
  ausnahme_gesetzt_am   timestamptz,
  notiz                 text,
  sortierung            int         not null default 0,
  -- Ohne Grund darf keine Ausnahme gesetzt werden.
  constraint ausnahme_braucht_grund
    check (ausnahme_aktiv = false or coalesce(trim(ausnahme_grund), '') <> '')
);

create index if not exists gruppe_vorgang_idx on gruppe (vorgang_id);

create table if not exists angebot (
  id                    uuid primary key default gen_random_uuid(),
  vorgang_id            uuid        not null references vorgang (id) on delete cascade,
  nummer                text        not null unique,
  gueltig_bis           date        not null,
  einleitung            text        not null default '',
  schlusstext           text        not null default '',
  -- Schlüssel für den persönlichen Angebotslink des Kunden.
  tracking_token        text        not null unique,
  versendet_am          timestamptz,
  angenommen_am         timestamptz,
  angenommen_von        text,
  abgelehnt_am          timestamptz,
  ablehnungsgrund       text,
  lexoffice_voucher_id  text,
  erstellt_am           timestamptz not null default now()
);

create index if not exists angebot_vorgang_idx on angebot (vorgang_id);

create table if not exists position (
  id                  uuid primary key default gen_random_uuid(),
  angebot_id          uuid        not null references angebot (id) on delete cascade,
  artikel_nummer      text        not null,
  bezeichnung         text        not null,
  beschreibung        text,
  menge               numeric(10, 2) not null,
  einheit             text        not null default 'Stück',
  einzel_brutto_cent  int         not null,
  ust                 numeric(4, 2) not null,
  rabatt_prozent      numeric(5, 2),
  -- Alternativpositionen zählen nicht zur Summe, der Kunde wählt eine aus.
  ist_alternative_zu  uuid        references position (id) on delete cascade,
  sortierung          int         not null default 0
);

create index if not exists position_angebot_idx on position (angebot_id);

-- Jeder Aufruf des Angebotslinks durch den Kunden.
create table if not exists oeffnung (
  id          uuid primary key default gen_random_uuid(),
  angebot_id  uuid        not null references angebot (id) on delete cascade,
  zeitpunkt   timestamptz not null default now(),
  -- Grobe Angabe wie "Handy" oder "Rechner". Keine IP-Adresse.
  geraet      text
);

create index if not exists oeffnung_angebot_idx on oeffnung (angebot_id);

create table if not exists zahlung (
  id                  uuid primary key default gen_random_uuid(),
  vorgang_id          uuid        not null references vorgang (id) on delete cascade,
  datum               date        not null,
  betrag_cent         int         not null,
  art                 text        not null default 'vollzahlung',
  notiz               text,
  lexoffice_beleg_id  text,
  erfasst_am          timestamptz not null default now()
);

create index if not exists zahlung_vorgang_idx on zahlung (vorgang_id);

create table if not exists notiz (
  id          uuid primary key default gen_random_uuid(),
  vorgang_id  uuid        not null references vorgang (id) on delete cascade,
  benutzer    text        not null,
  text        text        not null,
  zeitpunkt   timestamptz not null default now()
);

create index if not exists notiz_vorgang_idx on notiz (vorgang_id);

create table if not exists aufgabe (
  id          uuid primary key default gen_random_uuid(),
  vorgang_id  uuid        not null references vorgang (id) on delete cascade,
  faellig     date        not null,
  text        text        not null,
  erledigt    boolean     not null default false,
  benutzer    text,
  erstellt_am timestamptz not null default now()
);

create index if not exists aufgabe_offen_idx on aufgabe (faellig) where erledigt = false;

-- Menüwahl und Unverträglichkeiten, die der Kunde über den Angebotslink nachreicht.
create table if not exists gastangaben (
  vorgang_id            uuid primary key references vorgang (id) on delete cascade,
  menues                jsonb       not null default '{}'::jsonb,
  unvertraeglichkeiten  text        not null default '',
  gaesteliste           jsonb       not null default '[]'::jsonb,
  eingegangen_am        timestamptz not null default now()
);

-- Festgelegter Sitzplan eines Abends. Solange nichts festgelegt ist,
-- rechnet das Programm bei jedem Aufruf neu.
create table if not exists sitzplan (
  id              uuid primary key default gen_random_uuid(),
  vorstellung_id  uuid        not null references vorstellung (id) on delete cascade,
  -- Der komplette Plan, so wie der Sitzplaner ihn geliefert hat.
  plan            jsonb       not null,
  festgelegt_von  text,
  festgelegt_am   timestamptz not null default now(),
  unique (vorstellung_id)
);

-- Gemeinsame Linksammlung für alle Benutzer.
create table if not exists shortcut (
  id          uuid primary key default gen_random_uuid(),
  titel       text        not null,
  url         text        not null default '',
  notiz       text        not null default '',
  sortierung  int         not null default 0,
  erstellt_am timestamptz not null default now()
);
