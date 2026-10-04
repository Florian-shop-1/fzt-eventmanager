-- Mehr als drei Leute im Foyer.
--
-- Die Tabelle liess nur die Plaetze 1 bis 3 zu. Seit das Pluszeichen
-- beliebig viele Plaetze anbietet, scheiterte das Speichern der vierten
-- Person an dieser Pruefung (Florian, 04.10.2026: "wenn man eine vierte
-- person eingetragen hat, kommt das beim speichern").
--
-- Zwanzig ist die neue Grenze, dieselbe wie in der Oberflaeche. Sie steht
-- nur noch da, um Vertipper abzufangen.
alter table foyer_dienst drop constraint if exists foyer_dienst_nummer_check;

alter table foyer_dienst add constraint foyer_dienst_nummer_check
  check (nummer between 1 and 20);
