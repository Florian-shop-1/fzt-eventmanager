-- Dienstplan: jemanden direkt anfragen (Florian, 21.09.2026).
--
-- Bisher gab es nur "einteilen" (alle sehen es sofort) und "offen"
-- (alle mit der Position bekommen eine Mail). Florian und Kevin wollen
-- auch einen Mittelweg: eine Person fragen, nur die bekommt die Mail,
-- und sie sagt zu oder ab. Bis zur Zusage bleibt die Schicht, wie sie ist.

alter table dienst_einsatz add column if not exists angefragt_id uuid references benutzer (id) on delete set null;
alter table dienst_einsatz add column if not exists angefragt_von_id uuid references benutzer (id) on delete set null;
alter table dienst_einsatz add column if not exists angefragt_notiz text;
alter table dienst_einsatz add column if not exists angefragt_am timestamptz;
