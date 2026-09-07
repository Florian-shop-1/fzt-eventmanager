-- Ein Einlösehinweis je Vorrat, der in der Mail unter den Codes steht.
--
-- Anlass: Ditix zieht bei einem Freikarten-Code immer das teuerste Ticket
-- im Warenkorb ab. Wer vier Tickets kaufen will und den Code vorher
-- allein einlöst, verschenkt bares Geld. Das muss beim Kunden ankommen,
-- und zwar ohne dass jemand daran denken muss, es in die Einleitung zu
-- tippen.
--
-- Der Hinweis hängt am Vorrat, nicht an der Mail: Für Freikarten gilt
-- etwas anderes als für einen VIP-Parkplatz oder ein Souvenirglas.

alter table code_aktion add column if not exists hinweis text;

comment on column code_aktion.hinweis is
  'Steht in der Mail unter den Codes dieses Vorrats, etwa wie man sie einlöst.';
