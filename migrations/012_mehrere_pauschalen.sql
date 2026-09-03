-- Mehrere Getränkepauschalen je Gruppe.
--
-- Bisher konnte eine Gruppe genau eine Pauschale haben. In der Praxis ist
-- aber die Kombination aus Softdrink-Flat und Bier- und Wein-Flat die
-- beliebteste Buchung überhaupt: Wer keinen Alkohol trinkt, ist mit den
-- Softdrinks versorgt, alle anderen mit beidem.
--
-- Im Angebot stehen sie als zwei getrennte Positionen, und die Gastronomie
-- muss beide kennen, um die richtigen Bändchen auszugeben.

alter table gruppe add column if not exists getraenkepauschalen text[] not null default '{}';

-- Bestehende Einzelwerte übernehmen, damit nichts verlorengeht.
update gruppe
   set getraenkepauschalen = array[getraenkepauschale]
 where getraenkepauschale is not null
   and getraenkepauschalen = '{}';

alter table gruppe drop column if exists getraenkepauschale;

comment on column gruppe.getraenkepauschalen is
  'Artikelnummern der gebuchten Getränkepauschalen. Mehrere sind erlaubt, üblich ist Softdrink zusammen mit Bier und Wein.';
