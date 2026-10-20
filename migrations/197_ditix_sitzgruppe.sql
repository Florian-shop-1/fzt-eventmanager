-- Wer in der Ditix-Zeit zusammen gebucht hat, Platz für Platz.
--
-- Ditix gibt die Bestellzugehörigkeit nicht über eine Schnittstelle
-- heraus; in der Verwaltung steht sie aber zu jeder Bestellung. Bis jetzt
-- musste der Eventmanager deshalb raten: Was nebeneinander verkauft ist,
-- galt als eine Gruppe. Am 23.10. wurde daraus ein Block von acht, in
-- Wahrheit waren es zwei Buchungen, Irma Beck zu zweit und Benjamin
-- Reitzle zu sechst (Florian, 20.10.2026).
--
-- Was hier steht, ist abgeschrieben aus der Ditix-Verwaltung, einmalig
-- je Vorstellung. Für alles, was über FloTix verkauft wird, braucht es
-- diese Tabelle nicht: Dort steht die Buchung an jedem Platz.
--
-- Der Schlüssel ist der Platz, nicht das Ticket: Ein Platz gehört zu
-- genau einer Bestellung.
create table if not exists ditix_sitzgruppe (
  ditix_event_id text not null,
  sektor         text not null,
  reihe          text not null,
  platz          text not null,
  -- Die Bestellnummer aus Ditix, dazu der Name für die Anzeige.
  bestellung     text not null,
  name           text,
  erfasst_am     timestamptz not null default now(),
  primary key (ditix_event_id, sektor, reihe, platz)
);

create index if not exists ditix_sitzgruppe_event_idx on ditix_sitzgruppe (ditix_event_id);
