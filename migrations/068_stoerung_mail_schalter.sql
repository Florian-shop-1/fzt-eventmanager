-- Warnmails zu Shop-Störungen abschaltbar machen (Florian, 22.09.2026).
--
-- Julian hat den Buchungsfluss nachgezogen, sodass einzelne Abfragen
-- aufeinander warten. Der Rest der Meldungen entstand im Browser, ohne dass
-- ein Gast etwas davon gesehen hat: rund 2,5 Prozent der Besucher betroffen,
-- sichtbar unter 2 Prozent, Umsatzwirkung etwa 0,2 Prozent. Eine Warnung, die
-- meistens Fehlalarm ist, wird nicht mehr gelesen.
--
-- Deshalb kein Ausbau, sondern ein Schalter: Aufgezeichnet wird weiter alles,
-- verschickt wird nichts mehr. Die Agentur schaut die Fehler ohnehin durch
-- und hat einen Alarm, wenn sie deutlich ansteigen.

create table if not exists stoerung_einstellung (
  id            int primary key default 1 check (id = 1),
  mail_an       boolean not null default false,
  geaendert_am  timestamptz not null default now(),
  geaendert_von text,
  grund         text
);

insert into stoerung_einstellung (id, mail_an, geaendert_von, grund)
values (1, false, 'Florian',
        'Abgeschaltet nach Rücksprache mit Julian: Die Meldungen entstanden überwiegend im Browser und waren für Gäste kaum sichtbar.')
on conflict (id) do nothing;
