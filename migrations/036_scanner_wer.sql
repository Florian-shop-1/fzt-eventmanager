-- Wer hat gescannt, wer hat geprüft: auch über den Zugang, nicht nur den Namen.
--
-- Florian (17.09.2026): "Wichtig ist, dass man sieht, wann wer gescannt hat."
-- Der Name allein reicht nicht, weil er sich ändern kann (Mein Zugang).
-- Die Übersicht auf der Scanner-Seite zählt deshalb über die Kennung.

alter table scan_karte add column if not exists erstellt_von_id uuid references benutzer (id);
alter table scan_karte add column if not exists geprueft_von_id uuid references benutzer (id);
create index if not exists scan_karte_von on scan_karte (erstellt_von_id, erstellt_am desc);
