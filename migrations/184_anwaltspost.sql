-- Post von der Arbeitsrechtlerin, automatisch in die Akte (Florian, 15.10.2026).
--
-- "bei der Seichter möchte ich keinen Zwischenschritt, einfach
-- vollautomatisch der richtigen Person zuordnen. Jede Mail nur einmal.
-- Da ist eigentlich nur wichtig das PDF, kannst du uns auch gleich
-- anzeigen beim Schriftverkehr."
--
-- Festgehalten wird je Mail, was damit geschehen ist. Der Schlüssel ist
-- die Message-ID aus dem Mailkopf und nicht die Microsoft-Kennung: Die
-- gleiche Mail liegt in zwei Postfächern (Florian und Werner) und hat
-- dort je eine eigene Kennung, aber dieselbe Message-ID. So wird sie nur
-- einmal abgelegt.
create table if not exists anwaltspost (
  nachricht_id text primary key,
  von          text not null default '',
  betreff      text not null default '',
  empfangen_am timestamptz,
  -- Wem zugeordnet, und welche Datei daraus wurde.
  benutzer_id  uuid references benutzer (id) on delete set null,
  datei_id     uuid references personal_datei (id) on delete set null,
  -- 'abgelegt', 'ohne_anhang', 'niemand_erkannt', 'fehler'
  stand        text not null default 'abgelegt',
  notiz        text not null default '',
  erfasst_am   timestamptz not null default now()
);
