-- Was ein Angebot an Plätzen festhält, und bis wann (Florian, 28.10.2026).
--
-- "wenn es einen festen termin gibt, dann wäre doch super, wenn mit dem
-- versenden des angebots bereits sitzplätze reserviert sind und dies dem
-- kunden mitgeteilt wird. nach ablauf des Angebots werden die Plätze
-- automatisch freigegeben (es könnte DEZENT die zeit daneben stehen,
-- dass man bisschen druck hat)".
--
-- Festgehalten wird schon seit dem 26.10., aber nur in FloTix. Für die
-- Seite, die der Kunde sieht, muss es hier stehen: Sie ist öffentlich
-- erreichbar und soll dafür nicht bei FloTix anklopfen müssen.
--
-- Die Zahl ist der Stand beim Anlegen des Angebots. Was später daraus
-- wird, entscheidet FloTix: Dort läuft die Option ab, dort wird sie
-- aufgehoben, wenn der Kunde absagt.

alter table angebot
  add column if not exists plaetze_gehalten integer     not null default 0,
  add column if not exists plaetze_bis      timestamptz;
