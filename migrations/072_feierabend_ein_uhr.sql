-- Der Schlussstrich erst um 1 Uhr nachts (Florian, 23.09.2026).
--
-- 23:45 war zu früh: Nach einer Show wird abgebaut, aufgeräumt und noch
-- geredet, da ist um Mitternacht niemand fertig. Wer dann automatisch
-- ausgestempelt wird, verliert echte Arbeitszeit und muss sie hinterher
-- reklamieren.
--
-- Um 1 Uhr ist wirklich Schluss. Wer dann noch eingestempelt ist, hat es
-- vergessen, und genau darum bekommt er selbst eine Mail mit der Bitte,
-- die Zeit zu korrigieren.

update stempel_einstellung set feierabend = '01:00' where feierabend = '23:45';
alter table stempel_einstellung alter column feierabend set default '01:00';
