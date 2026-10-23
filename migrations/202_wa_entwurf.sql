-- Ein vorbereiteter Antworttext je Unterhaltung (Florian, 23.10.2026).
--
-- Fuer die Schlemmerblock-Anfragen: Der Eventmanager zieht den Code,
-- schreibt die Antwort und legt sie hier ab. Im Posteingang steht sie
-- dann im Antwortfeld, ein Mensch liest drueber und schickt sie los.
-- "bitte bau mal die version, dass wir druebergucken."
--
-- Je Unterhaltung genau ein Entwurf. Wird geantwortet, ist er erledigt
-- und verschwindet; ein zweiter Entwurf ersetzt den ersten.

begin;

create table if not exists wa_entwurf (
  wa_id        text primary key,
  text         text not null,
  -- Woraus er entstanden ist, fuer die spaetere Auswertung der Trefferquote.
  anlass       text not null default 'schlemmerblock',
  -- Die gezogenen Codes, damit im Nachhinein nachvollziehbar ist, was
  -- in diesem Entwurf steckte, auch wenn er nie abgeschickt wurde.
  codes        text not null default '',
  angelegt_am  timestamptz not null default now(),
  angelegt_von text not null default ''
);

comment on table wa_entwurf is
  'Vorbereitete WhatsApp-Antwort, die noch ein Mensch abschickt.';

commit;
