-- Die drei Shortcuts anlegen, die täglich gebraucht werden.
--
-- Bisher lagen sie nur im Browser des jeweiligen Benutzers. Damit waren
-- sie nach dem Leeren des Browsers weg, und niemand außer dem Eintragenden
-- hat sie je gesehen. Ab jetzt stehen sie in der gemeinsamen Datenbank.
--
-- Die Adressen bleiben leer: Sie werden im Programm eingetragen.

insert into shortcut (titel, url, notiz, sortierung)
select * from (values
  ('Versand', '', 'Google Tabelle', 1),
  ('Menüs',   '', 'Menübuchungen aus dem Shop', 2),
  ('Leads',   '', 'Anfragen aus Meta und Webshop', 3)
) as vorlage(titel, url, notiz, sortierung)
where not exists (select 1 from shortcut);
