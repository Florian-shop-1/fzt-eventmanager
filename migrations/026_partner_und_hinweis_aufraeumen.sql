-- Aufräumen: zwei Zwischenstände entfernen, die von besseren Lösungen
-- abgelöst wurden. Beide waren nur wenige Stunden in Betrieb.
--
-- 1) partner und partner_ablesung (Migration 022)
--
-- Gebaut für die monatliche Abrechnung mit Partnerhotels: Man liest den
-- kumulativen Zähler in Ditix ab und die Seite rechnet die Differenz zum
-- Vormonat. Das war die richtige Lösung unter der Annahme, dass die
-- Einlösungen nur in der Ditix-Oberfläche stehen.
--
-- Diese Annahme war falsch. Ditix exportiert die Codeliste als CSV, inklusive
-- Spalte "Letzte Einlösung". Der Codes-Bereich (Migration 023_aktionscodes)
-- liest genau das ein und kennt damit jeden einzelnen Code samt Einlösestatus.
-- Eine abgetippte Monatszahl daneben wäre die schlechtere Quelle und eine
-- zweite Stelle, an der dasselbe steht.
--
-- Beide Tabellen sind leer, es geht nichts verloren.
--
-- 2) shop_hinweis (Migration 021)
--
-- Ersetzt durch shop_buchung, wo die Unverträglichkeit nur ein Feld der
-- Buchung ist. Sie brauchte nie eine eigene Tabelle. Die vorhandene Zeile
-- wurde in Migration 023_shop_buchung übernommen, das Funktionsheet liest
-- bereits aus der neuen Tabelle.

drop table if exists partner_ablesung;
drop table if exists partner;
drop table if exists shop_hinweis;
