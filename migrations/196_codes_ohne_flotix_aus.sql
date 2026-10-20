-- Codes, die FloTix noch nicht einlösen kann, stehen nicht mehr bereit.
--
-- Die Freikarten-Codes liegen seit heute in FloTix und gelten wieder
-- (Migration 062 dort). Für ein kostenloses Souvenirglas und einen
-- kostenlosen VIP-Parkplatz gibt es dort noch keine Codeart: Diese
-- Codes würden an der Kasse abgewiesen.
--
-- Verschickt wurde von beiden bisher kein einziger, es geht also nichts
-- verloren. Sie werden nur ausgeblendet, damit Kevin nicht versehentlich
-- einen Code hinausgibt, der nicht funktioniert (Florian, 20.10.2026).
--
-- Sobald FloTix freie Zusatzleistungen über Codes kennt, wird aktiv
-- wieder auf true gesetzt.

update code_aktion
   set aktiv = false,
       hinweis = concat_ws(' ', hinweis,
         'Vorübergehend aus: FloTix kann diese Art Code noch nicht einlösen.')
 where name in ('Souvenirglas kostenlos', 'VIP-Parkplatz kostenlos');
