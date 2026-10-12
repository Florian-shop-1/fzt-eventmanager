-- Zwei Punkte mehr hinter der Bühne, vor der Show (Florian, 12.10.2026).
--
-- Der Würfel steht schon zweimal auf der Liste: einmal, um ihn aus dem
-- Rahmen zu nehmen, und jetzt einmal, um ihn mit der richtigen
-- Einstellung zurückzustellen. Deshalb sitzt der neue Punkt direkt
-- hinter dem alten, nicht am Ende.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'vor_show', 'Zauberwürfel mit richtiger Einstellung im Einstein-Rahmen', 65, 'show'
 where not exists (
   select 1 from showcheck_punkt p
    where p.liste = 'show' and p.text like 'Zauberwürfel mit richtiger%'
 );

-- Die Waffe muss einmal gefeuert sein, bevor sie in den Koffer kommt.
-- Das steht mit im Text: Ein Punkt, der nur "Paintballwaffe" heißt,
-- lässt genau den Handgriff offen, auf den es ankommt.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'vor_show', 'Paintballwaffe (einmal bereits gefeuert) in Koffer vorne Stage Left', 350, 'show'
 where not exists (
   select 1 from showcheck_punkt p
    where p.liste = 'show' and p.text like 'Paintballwaffe%'
 );
