-- Die Unterschrift des Arbeitgebers am Vertrag.
--
-- Sie wird im Augenblick der Mitarbeiterunterschrift dazugesetzt, nicht
-- vorher: "erst wenn der mitarbeiter unterschrieben hat, erscheint meine
-- unterschrift. er hat also keine möglichkeit den vertrag ohne seine
-- eigene, aber meine zu bekommen" (Florian, 01.10.2026).
--
-- Gespeichert wird sie am Vertrag und nicht nur zur Anzeige nachgeladen:
-- Ändert Florian später seine hinterlegte Unterschrift, bleibt auf einem
-- unterschriebenen Vertrag die, die damals daruntergesetzt wurde.

alter table arbeitsvertrag add column if not exists arbeitgeber_unterschrift text;
