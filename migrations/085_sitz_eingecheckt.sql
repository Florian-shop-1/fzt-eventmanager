-- Von Hand durch-x-en, wer sitzt (Florian, 28.09.2026).
--
-- Nach dem Umsetzen will das Team im Saalplan festhalten koennen, wer
-- tatsaechlich da ist: auf einen Platz tippen, ein X erscheint. Das ist
-- die Handarbeit-Vorstufe zu einem spaeteren Scanner (kommt erst mit dem
-- neuen Shop): bis dahin zaehlt allein, was hier von Hand markiert wurde.
--
-- Ein Platz ist einfach markiert oder nicht, id genuegt als Schluessel.
-- Nochmal antippen nimmt das X wieder weg, daher kein Verlauf noetig.

create table if not exists sitz_eingecheckt (
  ditix_event_id text not null,
  sitz_id        bigint not null,
  markiert_von   text not null,
  markiert_am    timestamptz not null default now(),
  primary key (ditix_event_id, sitz_id)
);

create index if not exists sitz_eingecheckt_event on sitz_eingecheckt (ditix_event_id);
