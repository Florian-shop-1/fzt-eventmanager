-- FZT-intern oder FZT-extern, und ob der Personalbogen ausgefüllt ist.
--
-- Florian (18.09.2026): Beim Anlegen eines Zugangs wählen, ob jemand
-- FZT-intern (angestellt, Lohnabrechnung) oder FZT-extern ist (Partner wie
-- der Food-Kiosk). Interne füllen einmal den Personalbogen aus, der geht
-- per Mail an das Lohnbüro.
--
-- Die Angaben selbst werden hier NICHT gespeichert. Sie enthalten
-- Sozialversicherungsnummer, IBAN, Steuer-ID, Konfession und
-- Schwerbehinderung, also besonders schützenswerte Daten. Der Eventmanager
-- reicht sie nur einmal an das Lohnbüro weiter und merkt sich, wann.

alter table benutzer add column if not exists art text check (art in ('intern', 'extern'));
alter table benutzer add column if not exists personalbogen_am timestamptz;

comment on column benutzer.art is 'intern = FZT-Mitarbeiter mit Lohnabrechnung, extern = Partner ohne Personalbogen. Leer = noch nicht festgelegt.';
comment on column benutzer.personalbogen_am is 'Wann der Personalbogen an das Lohnbüro ging. Leer = fehlt noch (nur bei intern).';

update benutzer set art = 'extern' where rolle = 'kiosk' and art is null;
