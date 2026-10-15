-- Bezahlte Anfahrtszeit je Arbeitstag (Florian, 15.10.2026).
--
-- "bei Julian Scherer wird pro Tag wo er hier ist eine extra Stunde
-- gestempelt (diese soll auch markiert sein als solche) - es ist die
-- Zeit für die Anfahrt nach Ulm. Das gibt es nur bei Julian Scherer."
--
-- Bisher hätte das jemand jeden Abend von Hand nachstempeln müssen, und
-- in der Lohnmeldung wäre nicht zu erkennen gewesen, dass es Fahrzeit
-- ist. Die Zeit hängt an der Person, nicht an der Schicht: Wer von
-- weiter weg kommt, fährt an jedem Arbeitstag.
alter table benutzer add column if not exists anfahrt_minuten integer not null default 0;

-- Julian Scherer wohnt in Geislingen und fährt für jede Schicht nach Ulm.
update benutzer set anfahrt_minuten = 60 where email = 'julianscherer214@gmail.com';
