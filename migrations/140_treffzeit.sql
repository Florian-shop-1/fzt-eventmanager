-- Wann jemand da sein soll, je Dienst (Florian, 05.10.2026).
--
-- Der Regelfall bleibt ohne Uhrzeit: Wer eingeteilt ist, weiß, wann die
-- Show beginnt, und richtet sich danach. Bei Sonderveranstaltungen ist das
-- anders. Zur Uni Ulm soll Ben zu einer bestimmten Zeit da sein, und das
-- gehört an den Dienst und nicht in eine Nachricht, die untergeht.
--
-- Leer heißt: keine besondere Zeit, es gilt der normale Ablauf.

alter table dienst_einsatz add column if not exists treffzeit text not null default '';
