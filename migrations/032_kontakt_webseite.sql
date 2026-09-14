-- Kontaktformular aus dem Shop im selben Posteingang wie WhatsApp.
--
-- Im Shop gibt es unten rechts "Fragen? Schreib uns". Wer WhatsApp hat,
-- landet dort direkt. Wer keins hat, hinterlässt Frage, Name und Telefon oder
-- Mail. Diese Anfragen kommen hierher, in dieselbe Liste wie die WhatsApp-
-- Unterhaltungen, damit das Büro nur an einer Stelle nachsehen muss.
--
-- Eine Anfrage von der Webseite ist eine eigene Unterhaltung. Ihre Kennung
-- beginnt mit "web-", damit sie nie mit einer Telefonnummer oder einer
-- WhatsApp-Nutzerkennung verwechselt wird und niemand versucht, per WhatsApp
-- darauf zu antworten.

alter table wa_unterhaltung add column if not exists kanal text not null default 'whatsapp';
alter table wa_unterhaltung drop constraint if exists wa_unterhaltung_kanal_check;
alter table wa_unterhaltung add constraint wa_unterhaltung_kanal_check
  check (kanal in ('whatsapp', 'webseite'));

-- Nur bei der Webseite gefüllt. Bei WhatsApp ist die Kennung die Nummer.
alter table wa_unterhaltung add column if not exists email text;
alter table wa_unterhaltung add column if not exists telefon text;
-- Was der Kunde sich gewünscht hat: 'anruf' oder 'mail'.
alter table wa_unterhaltung add column if not exists rueckweg text;
-- Von welcher Seite im Shop die Anfrage kam, etwa "/meandall".
alter table wa_unterhaltung add column if not exists seite text;

comment on column wa_unterhaltung.kanal is
  'whatsapp: Nachricht an 0731 7906110. webseite: Kontaktformular im Shop.';
