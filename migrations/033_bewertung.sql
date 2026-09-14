-- Bewertungsmail am Tag nach der Show, direkt aus dem Eventmanager.
--
-- Löst die Brevo-Automation "Danke für deinen Besuch" ab. Ablauf, wie Florian
-- ihn festgelegt hat (15.09.2026):
--
--   - Am Morgen nach der Show bekommt jeder Gast mit bezahlter Shop-Buchung eine
--     Mail mit fünf Sternen.
--   - 4 oder 5 Sterne: Die Seite im Shop dankt und zeigt Google und Tripadvisor.
--   - 1 bis 3 Sterne: Die Seite fragt nach, was nicht gepasst hat. Google und
--     Tripadvisor erscheinen dort nicht. Das Büro bekommt sofort eine Meldung
--     mit der Telefonnummer aus der Buchung und ruft zurück.
--
-- Florian ist darauf hingewiesen, dass Google und Tripadvisor diese Aufteilung
-- ("Review Gating") und Verlosungen für Bewertungen untersagen, und hat sich
-- bewusst dafür entschieden.

alter table shop_buchung add column if not exists bewertung_mail_am timestamptz;
alter table shop_buchung add column if not exists sterne int check (sterne between 1 and 5);
alter table shop_buchung add column if not exists sterne_am timestamptz;
alter table shop_buchung add column if not exists kritik text;
alter table shop_buchung add column if not exists kritik_am timestamptz;
-- Die Unterhaltung im Posteingang, die bei schlechter Bewertung angelegt wurde.
alter table shop_buchung add column if not exists bewertung_unterhaltung text;

-- Schlechte Bewertungen erscheinen im Posteingang neben WhatsApp und Webseite.
alter table wa_unterhaltung drop constraint if exists wa_unterhaltung_kanal_check;
alter table wa_unterhaltung add constraint wa_unterhaltung_kanal_check
  check (kanal in ('whatsapp', 'webseite', 'bewertung'));

-- Schalter: Bis Florian die Mail freigibt, geht nichts automatisch hinaus. Die
-- Probemail an sich selbst funktioniert auch ausgeschaltet.
create table if not exists bewertung_einstellung (
  id            int primary key default 1 check (id = 1),
  aktiv         boolean not null default false,
  geaendert_am  timestamptz not null default now(),
  geaendert_von text
);
insert into bewertung_einstellung (id) values (1) on conflict (id) do nothing;
