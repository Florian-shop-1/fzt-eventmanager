-- Sichtbar machen, dass die Kollegen gefragt wurden (Florian, 23.09.2026).
--
-- Wenn jemand "Ich kann nicht" klickt, geht sofort eine Mail an alle
-- Kollegen derselben Position, die an dem Abend frei sind. Das lief schon,
-- war aber nirgends zu sehen: Im Plan stand nur "sucht Ersatz", und
-- Florian konnte nicht wissen, ob wirklich jemand gefragt wurde.
--
-- Deshalb hier festhalten, wann und an wie viele.

alter table dienst_einsatz
  add column if not exists ersatz_gefragt_am     timestamptz,
  add column if not exists ersatz_gefragt_anzahl int not null default 0;
