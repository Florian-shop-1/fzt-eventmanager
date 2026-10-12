-- Die Anlage gehört direkt hinter das Licht.
--
-- Sie lag gleichauf mit dem Fernseher, und bei gleicher Nummer
-- entscheidet das Anlegedatum. Beides schaltet man beim Hereinkommen
-- ein, aber das Licht zuerst, dann die Anlage, dann der Fernseher.
update showcheck_punkt set reihenfolge = 22
 where liste = 'foyer' and text like 'Anlage für Licht und Ton%';
