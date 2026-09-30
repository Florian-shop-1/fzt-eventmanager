-- Eigene Termine: mit Show oder ohne (Florian, 30.09.2026).
--
-- Nicht jeder exklusiv gebuchte Abend ist eine Show. Manchmal mietet eine
-- Firma nur das Haus: Essen, Reden, Musik vom Band. Dann braucht es kein
-- Showteam, und der Dienstplan soll nicht drei Positionen ausschreiben,
-- die niemand besetzen muss.
--
-- Technik kann trotzdem nötig sein, auch ohne Show: Licht, Ton, Mikrofon
-- für die Ansprache. Deshalb eine eigene Frage danach.

begin;

alter table eigener_termin add column if not exists mit_show boolean not null default true;

-- Braucht es jemanden an der Technik? Nur gefragt, wenn keine Show ist.
alter table eigener_termin add column if not exists braucht_technik boolean not null default false;

commit;
