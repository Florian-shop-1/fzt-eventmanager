-- Die Abrechnung selbst aufheben (Florian, 01.10.2026).
--
-- "bei dem kreditkarte hochladen bitte die datein anzeigen die
-- hochgeladen sind und dass man sie auch anklicken kann zum angucken
-- später."
--
-- Bisher stand in der Liste nur, dass eine Datei eingelesen wurde. Wer
-- im November wissen will, was im September auf der Karte stand, musste
-- im OnlineBanking nachsehen. Jetzt liegt die Datei hier.

alter table kontoauszug_datei add column if not exists inhalt bytea;
alter table kontoauszug_datei add column if not exists typ text not null default '';
alter table kontoauszug_datei add column if not exists groesse int not null default 0;
