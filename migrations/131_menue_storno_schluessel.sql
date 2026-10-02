-- Der Storno traf alle statt nur einen (Florian, 02.10.2026).
--
-- "achtung, wenn man ganz stornieren macht, werden alle storniert - aber
-- es soll nur die gruppe storniert werden."
--
-- Grund: In der Spalte "Bestellung" der Shop-Tabelle steht bei jeder
-- Zeile derselbe Linktext "Bestellung anzeigen". Der Eventmanager hat
-- genau diesen Text als Kennung genommen, und damit passte ein Storno auf
-- jede Bestellung des Abends.
--
-- Ab jetzt ist die Bestellnummer die Kennung. Die bisherigen Eintraege
-- sind damit wertlos und kommen weg; es waren Testeintraege von heute.

delete from menue_storno where bestellung not like '%-%';

comment on column menue_storno.bestellung is
  'Bestellnummer aus der Shop-Tabelle. Frueher stand hier der Linktext, der bei allen Zeilen gleich war.';
