-- Wann jemand beim Lohnbüro abgemeldet wurde (Florian, 12.10.2026).
--
-- Die Abmeldung ist eine Mail, und Mails verschwinden im Postfach.
-- Hier steht sie am Zugang, damit niemand zweimal abmeldet oder es
-- ganz vergisst.
alter table benutzer add column if not exists abgemeldet_am timestamptz;
