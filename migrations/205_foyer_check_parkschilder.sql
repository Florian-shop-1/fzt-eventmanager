-- Die Parkplatzschilder der Abendshow (Florian, 24.10.2026).
--
-- "wichtig ist, dass die parkplätze für die 20:00 uhr show gehängt werden
-- sobald die erste show gestartet ist - also zwischen 15-16:00 uhr."
--
-- Der Grund ist der freie Platz: Solange kein Schild draußen steht, darf
-- dort jeder Gast parken. Wer die Abendschilder schon am Vortag
-- aufstellt, sperrt sieben Plätze für einen ganzen Tag, auf denen
-- mittags niemand steht.
--
-- Der Punkt steht in der ersten Hälfte, denn genau dann ist es zu tun.
-- An Tagen mit nur einer Show sagt der Wortlaut selbst, dass nichts zu
-- tun ist: Dann wurde wie gewohnt am Tag davor bestückt.
--
-- Dazu der zweite Punkt, der genauso wichtig ist: Hängt für eine Show
-- kein Schild, darf auch keins von gestern mehr draußen hängen.

begin;

insert into showcheck_punkt (liste, bereich, text, reihenfolge, link_url, link_titel)
select 'foyer', 'foyer_akt1',
       'Nur wenn heute zwei Shows sind: jetzt die Parkplatzschilder für die Abendshow aufstellen. Vorher bleiben die Plätze frei für alle Gäste.',
       5, '/parkplaetze', 'Zur Parkplatzliste'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and text like '%Parkplatzschilder für die Abendshow%');

insert into showcheck_punkt (liste, bereich, text, reihenfolge, link_url, link_titel)
select 'foyer', 'foyer_vor',
       'Draußen nachsehen: Hängt noch ein Parkplatzschild von gestern? Dann abnehmen, sonst steht ein freier Platz den ganzen Abend leer.',
       27, '/parkplaetze', 'Zur Parkplatzliste'
 where not exists (
   select 1 from showcheck_punkt
    where liste = 'foyer' and text like '%Parkplatzschild von gestern%');

commit;
