-- Was ein Gast auf der Antwortseite schreibt, gehört in den Posteingang
-- (Florian, 23.09.2026).
--
-- Bisher landete die Nachricht nur bei der Buchung und im Vertriebsverlauf.
-- Dort sieht sie niemand von selbst. Jetzt wird daraus eine Unterhaltung
-- wie beim Kontaktfenster, samt Meldemail, damit jemand antworten kann.

alter table wa_unterhaltung drop constraint if exists wa_unterhaltung_kanal_check;
alter table wa_unterhaltung add constraint wa_unterhaltung_kanal_check
  check (kanal in ('whatsapp', 'webseite', 'bewertung', 'abbrecher'));
