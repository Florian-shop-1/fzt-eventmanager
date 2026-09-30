-- Wer hat wann welche Zeit geändert, und warum.
--
-- Korrigieren konnte das Büro schon; was fehlte, war die Spur davon.
-- Ein gelöschter Stempel war danach einfach weg, und niemand konnte
-- später sagen, ob er je da war (Florian, 30.09.2026: "gerne mit grund
-- und doku, dass ich das geändert hab").
--
-- Arbeitszeit ist nachweispflichtig. Eine Korrektur ohne Begründung ist
-- im Zweifel wertlos, und zwar für beide Seiten.

create table if not exists stempel_aenderung (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references benutzer(id) on delete cascade,
  name text not null default '',
  -- Der Tag, um den es geht, JJJJ-MM-TT in hiesiger Zeit.
  tag date not null,
  -- 'geaendert', 'geloescht', 'nachgetragen', 'verschoben'
  was text not null,
  art text not null default '',
  alt_zeitpunkt timestamptz,
  neu_zeitpunkt timestamptz,
  grund text not null default '',
  wer text not null default '',
  wann timestamptz not null default now()
);

create index if not exists stempel_aenderung_person_tag
  on stempel_aenderung (benutzer_id, tag desc);
