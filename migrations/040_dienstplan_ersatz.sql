-- "Ich kann nicht, bitte übernehmen": Die Schicht bleibt bei der Person,
-- bis jemand anderes sie übernimmt. So bleibt kein Abend unbesetzt, nur
-- weil jemand etwas angefragt hat.
alter table dienst_einsatz add column if not exists sucht_ersatz boolean not null default false;
