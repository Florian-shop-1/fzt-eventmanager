-- Störungen: trennen, was ein Gast wirklich gesehen hat (Florian, 23.09.2026).
--
-- Bisher meldete der Shop jeden Fehlversuch, auch die, die er eine
-- Sekunde später selbst behoben hat. Davon hat kein Gast je etwas gemerkt,
-- und eine Warnung, die überwiegend Fehlalarm ist, liest niemand mehr.
--
-- Ab jetzt zählt der Shop mit, ob der Warteliste-Bildschirm einem Gast
-- tatsächlich angezeigt wurde, und meldet, wenn sich die Sache danach von
-- selbst oder auf Klick erledigt hat. Gemailt wird nur noch der Fall, in
-- dem jemand vor einem Termin stand, der buchbar sein sollte, und es
-- blieb dabei.

alter table technik_stoerung
  add column if not exists gesehen_anzahl int not null default 0,
  add column if not exists behoben_am     timestamptz,
  add column if not exists behoben_wie    text;

-- Was bisher aufgezeichnet wurde, ist nicht nach "gesehen" getrennt. Die
-- alten Zeilen bleiben stehen, zählen aber nicht als gesehen: Sie sollen
-- keine Mail von gestern nachtraeglich ausloesen.

-- Warnmails wieder an: Sie gehen jetzt nur noch hinaus, wenn ein Gast den
-- Bildschirm wirklich gesehen hat und es nicht von selbst wieder ging.
update stoerung_einstellung
   set mail_an = true,
       geaendert_am = now(),
       geaendert_von = 'Florian',
       grund = 'Wieder an, aber nur für Fälle, die ein Gast wirklich gesehen hat und die sich nicht von selbst erledigt haben.'
 where id = 1;
