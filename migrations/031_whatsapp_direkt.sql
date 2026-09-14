-- WhatsApp direkt bei Meta statt über 360dialog.
--
-- Entscheidung von Florian am 14.09.2026: Die Nummer 0731 7906110 zieht ganz
-- in den Eventmanager um. Die Business App fällt auf dieser Nummer weg, dafür
-- keine Monatsgebühr. Bei rund zehn Anfragen pro Woche stand der Preis eines
-- Anbieters (12 bis 49 Euro im Monat) in keinem Verhältnis.
--
-- Zwei Dinge fehlen damit, die bisher die App erledigt hat, und kommen hierher:
--
--  1. Das Klingeln. Ohne App meldet sich kein Handy mehr. Deshalb geht bei
--     einer neuen Nachricht eine Mail an tickets@, die kommt über Outlook
--     aufs Handy. Eine Mail pro Unterhaltung, bis jemand sie öffnet, nicht
--     eine pro Nachricht: Wer fünfmal hintereinander tippt, soll nicht fünf
--     Mails auslösen.
--
--  2. Die Abwesenheitsnotiz. Florian hatte in der App eine automatische
--     Antwort. Die gibt es jetzt hier, siehe wa_einstellung.

-- Wann für die aktuelle Runde ungelesener Nachrichten schon gemailt wurde.
-- Neu gemailt wird erst, wenn danach jemand gelesen hat.
alter table wa_unterhaltung add column if not exists mail_gemeldet_am timestamptz;

-- Wann zuletzt automatisch geantwortet wurde. Höchstens alle 12 Stunden eine,
-- und keine, wenn gerade jemand von uns mit dem Kunden schreibt.
alter table wa_unterhaltung add column if not exists autoantwort_am timestamptz;

-- Anderweitig erledigt, etwa angerufen oder per Mail geantwortet.
--
-- Der Posteingang warnt, wenn eine Kundennachricht unbeantwortet auf das Ende
-- der 24 Stunden zuläuft, und danach noch einmal. Wer den Kunden inzwischen
-- angerufen hat, nimmt die Warnung damit weg. Gilt nur bis zur nächsten
-- Nachricht des Kunden.
alter table wa_unterhaltung add column if not exists erledigt_am timestamptz;
alter table wa_unterhaltung add column if not exists erledigt_von text;

-- Automatische Antworten als eigene Herkunft, damit im Verlauf erkennbar ist,
-- dass das kein Mensch geschrieben hat.
alter table wa_nachricht drop constraint if exists wa_nachricht_herkunft_check;
alter table wa_nachricht add constraint wa_nachricht_herkunft_check
  check (herkunft in ('kunde', 'eventmanager', 'app', 'automatik'));

-- Eine Zeile, nicht mehr. Die Einstellungen gelten für die eine Nummer.
create table if not exists wa_einstellung (
  id                 int primary key default 1 check (id = 1),
  autoantwort_aktiv  boolean not null default true,
  autoantwort_text   text not null,
  geaendert_am       timestamptz not null default now(),
  geaendert_von      text
);

insert into wa_einstellung (id, autoantwort_text)
values (1, 'Danke für deine Nachricht an das Florian Zimmer Theater! Wir haben sie bekommen und melden uns so bald wie möglich bei dir. Tickets und alle Termine findest du jederzeit auf shop.florianzimmertheater.de')
on conflict (id) do nothing;
