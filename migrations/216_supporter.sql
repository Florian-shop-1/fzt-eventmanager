-- Supporter-Ticket (Florian, 26.10.2026): eine Freikarte, deren Gegenleistung eine Bewertung ist.
--
-- Nur bei diesen Gästen drängt die Bewertungsmail auf Google und Tripadvisor, und wir halten fest, ob sie es
-- (vermutlich) getan haben: Sie sind auf der Bewertungsseite auf einen der beiden Knöpfe getippt, oder das Büro hat es
-- von Hand abgehakt. Ob wirklich bewertet wurde, kann niemand automatisch prüfen.

alter table shop_buchung add column if not exists supporter boolean not null default false;
-- Auf Google oder Tripadvisor getippt (gilt für alle Gäste, ausgewertet wird es bei den Supportern).
alter table shop_buchung add column if not exists bewertung_klick_am timestamptz;
alter table shop_buchung add column if not exists bewertung_klick_wo text;
-- Einmal erinnert, wenn nach ein paar Tagen nichts passiert ist.
alter table shop_buchung add column if not exists bewertung_erinnerung_am timestamptz;
-- Von Hand abgehakt: "Ich habe die Bewertung gesehen" oder "Der Gast sagt, er hat bewertet".
alter table shop_buchung add column if not exists bewertung_erledigt_am timestamptz;
alter table shop_buchung add column if not exists bewertung_erledigt_von text;

create index if not exists shop_buchung_supporter_idx on shop_buchung (datum) where supporter;
