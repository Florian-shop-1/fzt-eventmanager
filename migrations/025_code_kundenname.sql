-- Wie der Vorrat beim Kunden heissen soll.
--
-- Anlass: In der Mail stand die Zeile "Kevins Codes:" über dem Code.
-- Intern ist der Name richtig, denn er steht so auch in Ditix und jeder
-- weiss, welcher Topf gemeint ist. Beim Kunden hat er nichts verloren.
--
-- Bleibt das Feld leer, wird weiter der interne Name genommen. Dann
-- steht in der Mail dasselbe wie bisher, und niemand muss etwas
-- nachtragen, damit überhaupt etwas hinausgeht.

alter table code_aktion add column if not exists kundenname text;

comment on column code_aktion.kundenname is
  'Überschrift über den Codes in der Mail. Leer: der interne Name wird genommen.';
