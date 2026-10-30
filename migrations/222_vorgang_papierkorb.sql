-- Papierkorb neben dem Archiv.
--
-- "mach am besten so, dass es gleich löscht.. aber du speicherst es im
-- archiv oder papierkorb.. so dass man zur not nochmal hinkommt"
-- (Florian, 30.10.2026).
--
-- Vorher führte der Weg zum Löschen über die Vorgangsseite und ein
-- aufklappbares Feld ganz unten, das Florian nicht gefunden hat. Jetzt
-- löscht der Knopf in der Zeile sofort, und zwar in den Papierkorb:
-- weg aus der Liste, aber mit einem Klick zurückzuholen.
--
-- Archiv und Papierkorb benutzen dieselbe Spalte für den Zeitpunkt und
-- unterscheiden sich nur in "ablage". Das hält die Abfragen einfach und
-- macht aus Archivieren und Löschen dieselbe, umkehrbare Bewegung.

alter table vorgang add column if not exists ablage text;

-- Was schon archiviert war, gehört ins Archiv und nicht in den Müll.
update vorgang set ablage = 'archiv' where archiviert_am is not null and ablage is null;

create index if not exists vorgang_ablage_idx on vorgang (ablage);
