-- Heimarbeit: Stunden ohne Uhrzeit.
--
-- "wie mach ich das wenn jemand von zu hause aus arbeitet. ich will
-- einfach die zeiten ins system, dass er die bekommt" (Florian,
-- 03.11.2026).
--
-- Der Anlass war Artems Antrag: 38 Stunden Videodreh und -bearbeitung
-- ueber sechzehn Tage. Das Antragsformular kennt nur einen Tag mit vier
-- Uhrzeiten, deshalb stand der Antrag als angenommen da, ohne dass eine
-- einzige Stunde gebucht war.
--
-- Bewusst keine Stempel: Wer zu Hause schneidet, hat keine Kommen- und
-- Gehen-Zeit, die jemand beobachtet hat. Uhrzeiten zu erfinden, damit
-- die Tabelle gefuellt aussieht, waere eine Luege im Stundennachweis.
-- Hier steht deshalb nur, was wirklich bekannt ist: Tag, Dauer, Zweck
-- und von wem die Angabe stammt. Im Protokoll ans Lohnbuero bleiben
-- Kommen und Gehen leer, die Zeile traegt die Art "Heimarbeit".

create table if not exists heimarbeit (
  id               uuid primary key default gen_random_uuid(),
  benutzer_id      uuid not null,
  name             text not null default '',
  datum            date not null,
  minuten          integer not null,
  zweck            text not null default '',
  nach_angabe_von  text not null default '',
  eingetragen_von  text not null default '',
  antrag_id        uuid,
  erstellt_am      timestamptz not null default now(),

  -- Mehr als zehn Stunden am Tag sind nach dem Arbeitszeitgesetz nicht
  -- zulaessig. Was darueber liegt, ist ein Tippfehler und keine Schicht.
  constraint heimarbeit_dauer check (minuten > 0 and minuten <= 600)
);

create index if not exists heimarbeit_datum_idx on heimarbeit (datum);
create index if not exists heimarbeit_benutzer_idx on heimarbeit (benutzer_id, datum);

-- Ein Tag je Person nur einmal. Nachtragen ueberschreibt dann, statt
-- die Stunden ein zweites Mal danebenzulegen.
create unique index if not exists heimarbeit_person_tag_idx on heimarbeit (benutzer_id, datum);
