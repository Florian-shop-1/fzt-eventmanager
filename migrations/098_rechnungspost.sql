-- Rechnungen, die per Mail hereinkommen (Florian, 29.09.2026).
--
-- Meta, Google und die anderen schicken ihre Rechnungen ohnehin per Mail,
-- und sie laufen alle in rechnung@florianzimmer.com. Bisher hat sie
-- jemand von dort heruntergeladen, ausgedruckt oder abfotografiert und
-- wieder hochgeladen. Das kann das Programm selbst.
--
-- Diese Tabelle merkt sich, welche Mail schon geholt wurde. Ohne sie
-- entstuende bei jedem Lauf derselbe Beleg noch einmal.
--
-- Gespeichert wird, was zum Wiederfinden noetig ist: Absender, Betreff,
-- Zeitpunkt. Der Inhalt der Mail wird nicht abgelegt, nur der Anhang
-- wird zum Beleg.

begin;

create table if not exists rechnungspost (
  -- Die Kennung der Mail bei Microsoft. Bleibt gleich, solange die Mail
  -- im Postfach liegt.
  nachricht_id text primary key,
  von          text not null default '',
  betreff      text not null default '',
  empfangen_am timestamptz,
  geholt_am    timestamptz not null default now(),
  -- angelegt, kein_anhang, fehler, uebersprungen
  stand        text not null default 'angelegt',
  notiz        text not null default '',
  -- Der daraus entstandene Beleg, falls einer entstanden ist.
  beleg_id     uuid references bewirtung (id) on delete set null
);

create index if not exists rechnungspost_zeit on rechnungspost (empfangen_am desc);

-- Woher ein Beleg stammt: abfotografiert oder aus dem Postfach.
alter table bewirtung add column if not exists herkunft text not null default 'foto'
  check (herkunft in ('foto', 'mail'));
alter table bewirtung add column if not exists mail_von text not null default '';
alter table bewirtung add column if not exists mail_betreff text not null default '';

commit;
