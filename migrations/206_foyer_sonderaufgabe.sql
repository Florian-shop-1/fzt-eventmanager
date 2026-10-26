-- Die Sonderaufgabe der Aushilfe (Florian, 24.10.2026).
--
-- "die aushilfe geht normalerweise nach der Pause der Show. wenn eine
-- Aushilfe aber beide shows macht, ist es ja blöd für sie zwischen den
-- shows nach hause zu gehen. sie kriegt dann eine sonderaufgabe für die
-- zweite hälfte der der ersten show und auch danach."
--
-- Die Notiz daneben gibt es schon, aber sie ist etwas anderes: Dort steht,
-- was zum Dienst zu wissen ist. Hier steht eine Aufgabe, die jemand
-- erledigt, und die soll man auch dann sehen, wenn man nur überfliegt.
-- Eintragen darf sie das Büro und die Person selbst.
begin;

alter table foyer_dienst
  add column if not exists sonderaufgabe text not null default '';

commit;
