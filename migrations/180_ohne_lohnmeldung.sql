-- Wer nie in der Stundenliste auftaucht (Florian, 15.10.2026).
--
-- "mich, Kevin und Werner bitte rausnehmen aus der Stundenliste. Wenn
-- wir stempeln, ist das nur zum Testen, von uns dreien werden nie
-- Stunden gemeldet."
--
-- Die Stempel bleiben erhalten, sie werden nur nicht mehr ausgewertet.
-- Sonst stünden Testzeiten in der Mail ans Lohnbüro.
alter table benutzer add column if not exists ohne_lohnmeldung boolean not null default false;

update benutzer set ohne_lohnmeldung = true
 where email in ('info@florianzimmer.com', 'kevin.steele@florianzimmer.com', 'w.zimmer@florianzimmer.com');
