-- Der Personalbogen ohne Sozialversicherungsnummer (Florian, 01.10.2026).
--
-- "Leeven kann seinen Personalbogen nicht ausfüllen, da er noch keine
-- Sozialversicherungsnummer hat. Mache - nur bei ihm - so, dass er den
-- Bogen auch ohne diese ausfüllen kann und du einfach alle paar Tage bei
-- ihm nachhakst."
--
-- Wer zum ersten Mal arbeitet, bekommt die Nummer erst mit der ersten
-- Meldung. Bis dahin kam er am Formular nicht vorbei, und das Lohnbüro
-- bekam gar nichts, obwohl alles andere längst feststand.
--
-- Die Ausnahme gilt je Person, nicht für alle: Sonst fehlt die Nummer am
-- Ende überall, und niemand merkt es.

alter table benutzer add column if not exists sv_nummer_spaeter boolean not null default false;
-- Wann zuletzt an die Nummer erinnert wurde, damit nicht täglich eine Mail kommt.
alter table benutzer add column if not exists sv_erinnert_am timestamptz;
