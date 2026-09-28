-- Festangestellt vs. Aushilfe fuer das ganze Haus (Florian, 28.09.2026).
--
-- Das Foyer hat diese Unterscheidung schon ueber foyer_person.fest, aber
-- nur foyer-intern. Fuers Schicht-Uebernehmen im Show-Dienstplan braucht
-- es dieselbe Unterscheidung auch dort: Eine Aushilfen-Schicht darf ohne
-- Freigabe uebernommen werden, eine Schicht von jemand Festangestelltem
-- (z. B. Ben) erst nach Freigabe durch Florian oder Kevin.

alter table benutzer add column if not exists fest boolean not null default false;
