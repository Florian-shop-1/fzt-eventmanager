-- Der Hase kann auch Danke sagen.
--
-- Bisher konnte er nur erinnern: fragendes Gesicht, Knopf "Mach ich!".
-- Unter einem Dankeschoen ist beides falsch, da gibt es nichts zu
-- versprechen (Florian, 05.10.2026: "der Hase soll sich bedanken bei
-- ihr", nachdem Veronica vier Vorschlaege fuer die Foyer-Liste
-- eingereicht hatte).
--
-- 'erinnern' bleibt die Vorgabe, alles Verschickte bleibt, wie es war.
alter table hasenpost
  add column if not exists anlass text not null default 'erinnern';
