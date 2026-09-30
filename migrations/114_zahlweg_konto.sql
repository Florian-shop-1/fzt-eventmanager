-- Der dritte Zahlweg: vom Konto.
--
-- Seit dem 30.09.2026 erkennt die Belegerkennung, wenn eine Rechnung per
-- Lastschrift eingezogen oder überwiesen wird, und trägt "konto" ein. Die
-- Prüfregel der Tabelle kannte diesen Wert nicht, und deshalb sind neun
-- Rechnungen aus dem Postfach beim Anlegen gescheitert: Sie stehen in
-- rechnungspost als "fehler" und wurden nie zu einem Beleg.
--
-- Das war ein Fehler von mir: Erst den Wert eingeführt, dann die Regel
-- vergessen, die ihn zulässt.

alter table bewirtung drop constraint if exists bewirtung_zahlweg_check;
alter table bewirtung add constraint bewirtung_zahlweg_check
  check (zahlweg = any (array['', 'karte', 'bar', 'konto']));
