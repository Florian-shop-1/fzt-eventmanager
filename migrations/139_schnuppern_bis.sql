-- Bis wann jemand geschnuppert hat.
--
-- Ohne dieses Datum waeren die Schnupperstunden wieder in der Meldung,
-- sobald der Haken weggeht: Wer anfaengt zu arbeiten, soll aber nur ab
-- dann gemeldet werden, und der Probetag bleibt draussen
-- (Florian, 05.10.2026).
alter table benutzer add column if not exists schnuppert_bis date;
