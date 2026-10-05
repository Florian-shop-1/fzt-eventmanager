-- Sieben Flyerdisplays, an einer Stelle statt an dreien.
--
-- Florian hat den Flyerpunkt selbst in den Einlass geschrieben, aus dem
-- PDF standen zwei ähnliche Punkte im Abschnitt davor. Drei Zeilen für
-- dieselbe Runde durchs Foyer liest niemand, also bleibt Florians Punkt,
-- jetzt mit der nachgezählten Verteilung (05.10.2026): vier auf der Bar,
-- zwei bei der Garderobe, eines beim Merch-Shop.
--
-- Die beiden anderen werden nur stillgelegt, nicht gelöscht: Haken, die
-- jemand schon gesetzt hat, sollen nicht verschwinden.
update showcheck_punkt
   set text = 'Alle 7 Flyerdisplays mit FZT-Flyern bestückt: 4 auf der Bar, 2 bei der Garderobe, 1 beim Merch-Shop. Auf jedem Stehtisch eine kleine Faltkarte (Firmenevents)'
 where liste = 'foyer' and bereich = 'foyer_einlass' and text like 'Alle 7 Flyer Displays%';

update showcheck_punkt
   set aktiv = false
 where liste = 'foyer'
   and bereich = 'foyer_vor'
   and (text like 'Flyerständer prüfen%' or text like 'Auf jedem Stehtisch liegt ein Kärtchen%');
