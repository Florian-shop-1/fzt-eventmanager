-- "FOH Informationen ob Wehrwolf Show" fällt weg.
--
-- Der Punkt stammt aus der Zeit, als der Werwolf nicht in jeder Show
-- vorkam. Heute ist er in jeder: "jede show ist mit werewolf" (Florian,
-- 10.10.2026). Eine Frage, deren Antwort immer gleich ist, hakt man ab,
-- ohne sie zu lesen, und genau das färbt auf die Punkte daneben ab.
--
-- Stillgelegt, nicht gelöscht: Die Haken vergangener Abende sollen
-- stehen bleiben.
update showcheck_punkt
   set aktiv = false
 where liste = 'show' and text ilike '%wehrwolf%';
