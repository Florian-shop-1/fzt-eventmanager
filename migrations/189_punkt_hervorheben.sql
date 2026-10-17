-- Ein Punkt, den man nicht überlesen darf (Florian, 17.10.2026).
--
-- "check für vor der Show, Mitte, farbig hervorheben: Habt ihr alles um
-- das Foyer zu öffnen? Geldbeutel, genug Pinsa, Aperol? Wenn nicht,
-- bitte jetzt noch melden über den Foyer-Chat."
--
-- Der Punkt ist keine Handlung, sondern eine Frage, und er steht
-- bewusst in der Mitte der Liste: Dort ist noch Zeit, etwas zu holen.
-- Deshalb bekommt er Farbe, sonst geht er zwischen den Handgriffen
-- unter.
alter table showcheck_punkt add column if not exists hervorgehoben boolean not null default false;

insert into showcheck_punkt (bereich, text, reihenfolge, liste, hervorgehoben)
select 'foyer_vor',
       'Habt ihr alles, um das Foyer zu öffnen? Geldbeutel, genug Pinsa, Aperol? Wenn nicht, bitte jetzt noch über den Foyer-Chat melden.',
       55, 'foyer', true
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and bereich = 'foyer_vor' and text like 'Habt ihr alles%'
 );
