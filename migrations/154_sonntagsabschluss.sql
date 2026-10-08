-- Der Sonntagsabschluss im Foyer.
--
-- Sonntag ist der letzte Showtag der Woche, danach steht das Haus ein
-- paar Tage still. Was dann noch läuft, läuft umsonst: "nur wenn der
-- letzte ausstempelt am Sonntag im foyer, sind alle Kühltheken
-- abgeschaltet, Musik und Licht aus?" (Florian, 08.10.2026).
--
-- Gefragt wird beim Ausstempeln, bei der Person, die als letzte geht.
-- Festgehalten wird die Antwort, damit montags nachvollziehbar ist, wer
-- was gesagt hat, falls doch etwas lief.
create table if not exists abendabschluss (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null,
  benutzer_id   uuid references benutzer (id) on delete set null,
  name          text not null default '',
  -- true = alles aus. false = etwas lief noch, siehe offen.
  alles_aus     boolean not null,
  offen         text not null default '',
  bestaetigt_am timestamptz not null default now()
);

create index if not exists abendabschluss_datum on abendabschluss (datum desc);
