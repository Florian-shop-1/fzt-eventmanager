-- Rechnungen mit Positionen, aus dem Programm heraus (25.09.2026).
--
-- Bisher kannte eine Rechnung nur einen Betrag. Das reichte, solange sie
-- in Lexware Office gesetzt und von dort verschickt wurde und hier nur
-- der Zahlungsabgleich lief.
--
-- Jetzt entsteht sie hier: aus dem angenommenen Angebot, mit denselben
-- Positionen, demselben Steuerausweis und als PDF. Dafuer braucht sie
-- drei Dinge mehr:
--
--  * die Positionen selbst,
--  * den Absender, wie er zum Zeitpunkt der Rechnung galt (aendert sich
--    spaeter die Bankverbindung, muss die alte Rechnung gleich bleiben),
--  * den Bezug zum Angebot, damit man beides nebeneinanderlegen kann.

begin;

alter table rechnung add column if not exists angebot_id uuid references angebot (id) on delete set null;
alter table rechnung add column if not exists positionen jsonb;
alter table rechnung add column if not exists absender jsonb;
alter table rechnung add column if not exists leistungszeitraum text not null default '';

-- Wann der Kunde die Rechnung geoeffnet hat. Dasselbe Verfahren wie beim
-- Angebot: ein Schluessel im Link, kein Zaehlpixel.
alter table rechnung add column if not exists zugang_token uuid not null default gen_random_uuid();
alter table rechnung add column if not exists zuerst_geoeffnet_am timestamptz;

create unique index if not exists rechnung_zugang on rechnung (zugang_token);

-- Die Dankesmail nach dem Geldeingang geht genau einmal raus.
alter table rechnung add column if not exists dank_mail_am timestamptz;

commit;
