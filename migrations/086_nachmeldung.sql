-- Strukturierte Selbstauskunft nach einem vergessenen Ausstempeln
-- (Florian, 28.09.2026).
--
-- Bisher stand im Antrag nur freier Text ("Ich bin um 19 Uhr gegangen").
-- Das Buero musste den Text lesen und die Zeit von Hand in "Zeiten
-- korrigieren" eintragen. Diese Spalten lassen den Mitarbeiter die
-- tatsaechlichen Zeiten direkt angeben, damit Florian oder Kevin sie mit
-- einem Klick uebernehmen koennen, statt sie abzutippen.
--
-- Alle vier sind optional: Meist fehlt nur "gehen", die anderen bleiben
-- leer und werden beim Uebernehmen einfach ausgelassen.

alter table stempel_antrag add column if not exists vorschlag_kommen timestamptz;
alter table stempel_antrag add column if not exists vorschlag_pause_start timestamptz;
alter table stempel_antrag add column if not exists vorschlag_pause_ende timestamptz;
alter table stempel_antrag add column if not exists vorschlag_gehen timestamptz;
