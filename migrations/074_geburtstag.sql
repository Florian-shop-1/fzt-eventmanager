-- Geburtstag am Benutzer selbst (Florian, 23.09.2026).
--
-- Bisher stand das Datum nur in der Geheimhaltungsvereinbarung. Wer die
-- noch nicht unterschrieben hat, wurde deshalb nie gefeiert, und das ist
-- bei den meisten im Showteam der Fall.
--
-- Gespeichert wird nur Tag und Monat ("15.05"), ohne Jahr. Gefeiert wird
-- der Geburtstag, das Alter geht niemanden etwas an, und Daten, die wir
-- nicht brauchen, sammeln wir auch nicht.

alter table benutzer add column if not exists geburtstag text;

alter table benutzer drop constraint if exists benutzer_geburtstag_form;
alter table benutzer add constraint benutzer_geburtstag_form
  check (geburtstag is null or geburtstag ~ '^[0-3][0-9]\.[0-1][0-9]$');

-- Was in der Geheimhaltung schon steht, gleich übernehmen: Tag und Monat
-- aus "TT.MM.JJJJ". Leere und krumme Einträge bleiben aussen vor.
update benutzer b
   set geburtstag = left(btrim(g.geburtsdatum), 5)
  from geheimhaltung g
 where g.benutzer_id = b.id
   and b.geburtstag is null
   and btrim(g.geburtsdatum) ~ '^[0-3][0-9]\.[0-1][0-9]\.';
