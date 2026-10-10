-- Die Klimaanlage ganz ans Ende, auch hinter der Bühne.
--
-- Auf der Showliste sind seit kurzem "Flaschenpost hochziehen" (330)
-- und "Zeitmaschine einschalten vor Trick" (340) dazugekommen. Die
-- Klimaanlage lag damit mittendrin, dabei ist sie das Letzte vor dem
-- Beginn, genau wie am Pult.
update showcheck_punkt
   set reihenfolge = 400
 where liste = 'show' and text like 'Klimaanlage%';
