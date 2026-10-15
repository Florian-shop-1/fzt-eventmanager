-- Wann wurde ein privat ausgelegter Beleg erstattet? (Florian, 15.10.2026)
--
-- "in bar privat ausgelegt wäre noch richtiger. Es muss ja irgendwann
-- ausbezahlt werden." Solche Belege standen bisher als "noch offen" in
-- der Liste und warteten auf eine Abbuchung, die nie kommt: Bezahlt hat
-- sie jemand aus der eigenen Tasche. Offen ist nicht die Rechnung,
-- sondern die Erstattung.
alter table bewirtung add column if not exists erstattet_am timestamptz;
alter table bewirtung add column if not exists erstattet_von text not null default '';
