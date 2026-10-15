-- Wann wurde der Personalbogen angefordert? (Florian, 15.10.2026)
--
-- "man sieht gar nicht, dass der schon versendet wurde." Bisher setzte
-- das Anfordern nur den Haken zurück und verschickte eine Mail; in der
-- Akte blieb davon nichts stehen. Wer nach zwei Tagen hinsah, konnte
-- nicht wissen, ob schon jemand nachgehakt hatte.
alter table benutzer add column if not exists bogen_angefordert_am timestamptz;

-- Verträge auf Papier gehen nicht mehr ans Lohnbüro: Sie stammen aus der
-- Zeit vor dem Eventmanager, das Büro hat sie längst.
update arbeitsvertrag set lohnbuero_am = unterschrieben_am
 where auf_papier and lohnbuero_am is null and unterschrieben_am is not null;
