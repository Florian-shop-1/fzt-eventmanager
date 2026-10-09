-- Wann die Gastro erfahren hat, dass ihr Wein bereitsteht.
--
-- Die Bereitstellungsmail ging raus und hinterliess keine Spur: Weder
-- auf der Seite noch in der Datenbank stand, ob sie verschickt wurde,
-- an wen und wann. Florian hat sie am 09.10.2026 von Hand nachgeschickt
-- und konnte es hinterher nirgends nachsehen.
--
-- Eine Zeile pro Bestellung genuegt. Mehrfaches Nachschicken
-- ueberschreibt den Zeitpunkt, denn interessant ist, ob und wann
-- zuletzt Bescheid gegeben wurde.

alter table wein_bestellung add column if not exists gemeldet_am timestamptz;
alter table wein_bestellung add column if not exists gemeldet_an text not null default '';
