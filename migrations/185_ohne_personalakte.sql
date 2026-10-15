-- Wer keine Personalakte braucht (Florian, 15.10.2026).
--
-- "Kevin bitte auch bei Personalakte rausnehmen" und "ich, Florian,
-- brauche auch keine Personalakte". Ihre Zugänge bleiben, sie stehen nur
-- nicht mehr in der Liste der Akten: Dort geht es um Personalbogen,
-- Arbeitsvertrag und Lohn, und das führen die beiden nicht über das
-- Programm.
alter table benutzer add column if not exists ohne_personalakte boolean not null default false;

update benutzer set ohne_personalakte = true
 where email in ('info@florianzimmer.com', 'kevin.steele@florianzimmer.com');
