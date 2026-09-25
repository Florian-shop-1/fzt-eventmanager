-- Wie lange das Geschenk gilt (Florian, 23.09.2026).
--
-- Das Angebot laeuft 24 Stunden. Die Frist gehoert an das Geschenk, damit
-- die Seite mit der laufenden Uhr weiss, wann Schluss ist, und nicht neu
-- gerechnet werden muss.

alter table abbruch_geschenk add column if not exists gilt_bis timestamptz;
