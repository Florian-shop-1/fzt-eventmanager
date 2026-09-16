-- Scanner für die Glücks-Moji-Karten.
--
-- Das Foyer fotografiert die ausgefüllten Karten mit Handy oder iPad. Der
-- Eventmanager liest Vorname, Nachname, E-Mail und Telefon und trägt die
-- Adresse bei Brevo in die Listen "Magic News" und "Emoji" ein.
--
-- Ablauf, wie Florian ihn festgelegt hat (16.09.2026):
--   - Zuerst liest Azure (kostenlos). Ist alles eindeutig, geht die Karte
--     sofort an Brevo.
--   - Ist irgendetwas unklar, liest Claude nachts nach (Batch, halber Preis).
--     Ist Claude sicher, geht die Karte an Brevo.
--   - Bleibt ein Zweifel, prüft ein Mensch und korrigiert von Hand.
--   - Kein Double-Opt-in. Fotos werden nach 30 Tagen gelöscht. Die Farbe der
--     Karte bedeutet nichts.
--
-- Die Papierkarten sind der Nachweis der Einwilligung und werden aufbewahrt.

create table if not exists scan_karte (
  id                 uuid primary key default gen_random_uuid(),
  erstellt_am        timestamptz not null default now(),
  erstellt_von       text not null,
  -- JPEG, auf dem Handy verkleinert. Nach 30 Tagen gelöscht.
  foto               bytea,
  foto_hash          text unique,
  foto_geloescht_am  timestamptz,

  status             text not null default 'neu' check (status in (
                       'neu',             -- hochgeladen, Azure noch nicht gelaufen
                       'wartet_claude',   -- unklar, Claude liest in der Nacht
                       'claude_laeuft',   -- an Claude übergeben, Ergebnis steht aus
                       'pruefen',         -- ein Mensch muss bestätigen
                       'uebertragen',     -- bei Brevo eingetragen
                       'doppelt',         -- Adresse war schon da
                       'verworfen',       -- leer, unleserlich oder keine Karte
                       'fehler'           -- Brevo hat abgelehnt
                     )),
  -- Warum die Karte geprüft werden muss oder was schiefging, in Klartext.
  grund              text,

  vorname            text,
  nachname           text,
  email              text,
  telefon            text,
  -- Felder, die rot markiert werden: vorname, nachname, email, telefon.
  unsicher           text[] not null default '{}',
  -- Was Azure und Claude gelesen haben, samt Alternativen und Hinweisen.
  lesungen           jsonb not null default '{}'::jsonb,

  claude_batch       text,
  claude_gesendet_am timestamptz,
  claude_am          timestamptz,
  -- Kosten der Claude-Lesung in US-Cent.
  kosten_cent        numeric(8, 3),

  geprueft_von       text,
  geprueft_am        timestamptz,
  brevo_am           timestamptz,
  brevo_fehler       text
);

create index if not exists scan_karte_status on scan_karte (status);
create index if not exists scan_karte_email on scan_karte (lower(email));
create index if not exists scan_karte_erstellt on scan_karte (erstellt_am desc);

-- Welche Brevo-Listen. Wird auf der Scanner-Seite aus den Listen in Brevo gewählt.
create table if not exists scan_einstellung (
  id                int primary key default 1 check (id = 1),
  liste_newsletter  int,
  liste_emoji       int,
  geaendert_am      timestamptz not null default now(),
  geaendert_von     text
);
insert into scan_einstellung (id) values (1) on conflict (id) do nothing;
