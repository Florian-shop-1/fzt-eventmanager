-- Erinnerungen an die Parkplatzschilder.
--
-- Zwei Sorten Eintrag in derselben Tabelle:
--
--   'hase'    Der Hase hat es beim Ausstempeln gesagt.
--   'buero'   Florian und Kevin haben die Meldung bekommen.
--   'antwort' Was der Mitarbeiter geantwortet hat: erledigt oder warum nicht.
--
-- Die ersten beiden halten die Wiederholung im Zaum, höchstens einmal je
-- Tag und Anlass. Der dritte ist die Spur, an der sich später ablesen
-- lässt, ob die Erinnerung etwas gebracht hat (Florian, 06.10.2026:
-- "beobachte das ganze mal").
create table if not exists parkplatz_mahnung (
  id         uuid primary key default gen_random_uuid(),
  datum      date not null,
  anlass     text not null,
  name       text not null default '',
  antwort    text not null default '',
  gemeldet_am timestamptz not null default now()
);

-- Je Tag und Anlass nur einmal mahnen. Antworten dürfen mehrfach kommen:
-- Zwei Leute können nacheinander dasselbe sagen, und beides zählt.
create unique index if not exists parkplatz_mahnung_einmal
  on parkplatz_mahnung (datum, anlass) where anlass <> 'antwort';
