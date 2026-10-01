-- Ein neuer Vertrag löst den alten ab (Florian, 01.10.2026).
--
-- Bisher durfte jeder nur einen gültigen Vertrag haben. Das war zu streng:
-- "wenn man jemanden einen vertrag gemacht hat, dann kann man aktuell ihm
-- keinen neuen machen. das sollte aber gehen. im vertrag steht ja immer
-- 'ersetzt andere verträge'. nur so kann ich gehaltserhöhungen
-- durchführen."
--
-- Also: beliebig viele Verträge je Person, aber immer nur einer in Kraft.
-- Sobald der neue unterschrieben ist, wird der alte abgelöst und bleibt
-- als Beleg stehen. Gelöscht wird nichts; ein Vertrag, der verschwindet,
-- ist kein Beleg mehr.

alter table arbeitsvertrag add column if not exists abgeloest_am timestamptz;
alter table arbeitsvertrag add column if not exists abgeloest_durch uuid;

drop index if exists arbeitsvertrag_einer_je_person;

-- Was weiterhin nicht geht: zwei Verträge gleichzeitig zur Unterschrift.
-- Sonst wüsste niemand, welcher gilt.
create unique index if not exists arbeitsvertrag_ein_offener_je_person
  on arbeitsvertrag (benutzer_id)
  where zurueckgezogen_am is null and unterschrieben_am is null;
