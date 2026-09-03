-- Das Startpasswort bleibt lesbar, bis der Benutzer ein eigenes vergibt.
--
-- Warum das vertretbar ist: Ein Startpasswort hat die Geschäftsführung
-- vergeben, nicht der Benutzer. Es ist kein persönliches Geheimnis, sondern
-- eine Einmalinformation, die ohnehin weitergegeben werden muss. Solange es
-- gilt, kann Florian in der Liste nachsehen, statt es neu vergeben zu müssen.
--
-- Sobald jemand ein eigenes Passwort setzt, wird dieses Feld geleert. Ab dann
-- existiert das Passwort nirgends mehr im Klartext, auch nicht für die
-- Geschäftsführung. Selbst gewählte Passwörter werden oft mehrfach verwendet,
-- die gehören niemandem außer dem Benutzer.

alter table benutzer add column if not exists startpasswort text;

comment on column benutzer.startpasswort is
  'Nur solange muss_passwort_aendern = true. Wird beim ersten selbst gesetzten Passwort geleert.';
