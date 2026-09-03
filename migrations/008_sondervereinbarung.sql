-- Individuelle Vereinbarungen je Gruppe.
--
-- Bei Firmenevents wird regelmäßig etwas vereinbart, das im Artikelstamm
-- nicht steht: eine eigene Getränkepauschale, ein zusätzlicher Gang, ein
-- Absprache über den Ausschank nach der Show. Bisher stand so etwas
-- höchstens in einer Notiz, und Notizen sieht die Gastronomie nicht.
--
-- Genau diese Angaben braucht Osman aber zweimal: am Abend, um zu wissen
-- was er ausgibt, und danach, um mit uns abzurechnen. Deshalb bekommen
-- sie ein eigenes Feld, das im Funktionsheet erscheint.

alter table gruppe add column if not exists sondervereinbarung text;

comment on column gruppe.sondervereinbarung is
  'Frei vereinbarte Leistung dieser Gruppe, im Klartext. Erscheint im Funktionsheet unter Getränke, damit die Gastronomie sie ausgibt und später abrechnen kann.';
