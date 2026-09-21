-- Wer da sitzt (Florian, 21.09.2026).
--
-- Ditix liefert ueber den oeffentlichen Weg nur, welcher Platz verkauft
-- ist, nicht wer ihn gekauft hat. Am Einlass steht der Name aber auf der
-- Karte in der Hand des Gastes. Deshalb kann er hier in einem Feld
-- mitgeschrieben werden; danach steht er im Saalplan an der Gruppe.

alter table upgrade_umsetzung add column if not exists gast_name text not null default '';
