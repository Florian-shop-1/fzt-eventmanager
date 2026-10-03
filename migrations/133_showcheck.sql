-- Die Show-Checkliste (Florian, 03.10.2026).
--
-- "bei show/tipps und tricks machst du bitte checklisten, die abgehakt
-- werden sollen / sehen die mitarbeiter an dem abend die da arbeiten (nur
-- showteam)". Zwei Listen: vor der Show und in der Pause.
--
-- Die Punkte stehen in einer eigenen Tabelle, nicht im Programmtext: Eine
-- Checkliste ändert sich mit jeder neuen Nummer, und dafür soll niemand
-- den Eventmanager neu bauen müssen.
--
-- Abgehakt wird je Vorstellung. Was gestern abgehakt war, sagt über heute
-- nichts, und am Ende des Abends muss man sehen können, wer was gemacht
-- hat.

create table if not exists showcheck_punkt (
  id          uuid primary key default gen_random_uuid(),
  -- 'vor_show', 'pause' oder 'nach_show'
  bereich     text not null check (bereich in ('vor_show', 'pause', 'nach_show')),
  text        text not null,
  reihenfolge int not null default 0,
  aktiv       boolean not null default true,
  angelegt_am timestamptz not null default now()
);

create index if not exists showcheck_punkt_sortierung on showcheck_punkt (bereich, reihenfolge);

create table if not exists showcheck_haken (
  ditix_event_id text not null,
  punkt_id       uuid not null references showcheck_punkt (id) on delete cascade,
  datum          date not null,
  erledigt_von   text not null default '',
  erledigt_am    timestamptz not null default now(),
  primary key (ditix_event_id, punkt_id)
);

create index if not exists showcheck_haken_datum on showcheck_haken (datum);

-- Die Listen, wie Florian sie am 03.10.2026 übergeben hat, Wort für Wort
-- und in seiner Reihenfolge.
insert into showcheck_punkt (bereich, text, reihenfolge)
select 'vor_show', text, reihenfolge from (values
  ('Milchbecher', 10),
  ('Fly laden', 20),
  ('Zuschauer prüfen, da? Kleidung', 30),
  ('Seil präpariert ???', 40),
  ('Auto Cubes', 50),
  ('Zauberwürfel aus Rahmen nehmen (Zuschauerliste +5)', 60),
  ('Tuch-Würfel-Rutsche präpariert und getestet (nur bei Empore)', 70),
  ('Vorhang zur Werkstatt geschlossen (geheime Tür!)', 80),
  ('Akkus geladen / getestet', 90),
  ('Bingo aufblasen', 100),
  ('Bingo Karten verteilen', 110),
  ('Kerze kleinere U-Scheibe', 120),
  ('Luftballon', 130),
  ('Flaschenpost Plastik in Flasche', 140),
  ('Flaschenpost Papier', 150),
  ('Rotes Tuch', 160),
  ('Wasser und Pulver für KI', 170),
  ('Rose Paddle Bühnenkante schwarze Kiste + Gläser', 180),
  ('Tattoo Wasserschüssel, Schwamm, Stift, Handtuch', 190),
  ('Rose + Cuvée im Kühlschrank', 200),
  ('Zwangsjacke bei Todeskralle', 210),
  ('Seil an Todeskralle', 220),
  ('Plexiglas sauber und vorbereitet', 230),
  ('Check ob Rose drin ist Bühnenkante', 240),
  ('Hand-Kamera funkt und Bildschirm gedreht', 250),
  ('Kamera und Sender an ohne Filter, ohne Licht bei Tattoo', 260),
  ('Vor Showstart Münze machen', 270),
  ('Wurde das Upgrade korrekt durchgeführt? Wenn nicht, vor Showstart die letzten zwei Reihen ansprechen und vorne auffüllen', 280),
  ('Heizdecke kurz vor Einlass anschalten', 290),
  ('Münztisch spannen', 300),
  ('Zeitmaschine testen', 310),
  ('FOH Informationen ob Wehrwolf Show', 320),
  ('Flaschenpost hochziehen', 330),
  ('Zeitmaschine einschalten vor Trick', 340)
) as v(text, reihenfolge)
where not exists (select 1 from showcheck_punkt where bereich = 'vor_show');

insert into showcheck_punkt (bereich, text, reihenfolge)
select 'pause', text, reihenfolge from (values
  ('10 min Gong', 10),
  ('5 Minuten Dong Nr. 2', 20),
  ('Dong Show startet jetzt', 30),
  ('Flo an Papierrose erinnern + Parfüm', 40),
  ('Zeitmaschine aus ???', 50),
  ('Kleine schwarze Kiste weg?', 60),
  ('Vergessene Dinge eingesammelt (Rose/Hammer)', 70),
  ('Luftballon vorbereitet', 80),
  ('Benzin in Kerze / Funktionstest', 90),
  ('Vorhang bei Kralle zu', 100),
  ('UV-Lampe an', 110),
  ('Bingo-Bälle vorstellen zu FOH', 120),
  ('Magic Cuvée an Bühnenkante legen', 130),
  ('Karabiner am Bühnenschacht', 140),
  ('Fackelständer', 150),
  ('Fluchtkiste auf Position', 160),
  ('Benzin in Käfig', 170),
  ('Benzin auf Fackel', 180),
  ('Umhang innen beim Käfig', 190),
  ('Saallicht aus wenn Flo in Kralle', 200),
  ('Guckloch offen am Vorhang', 210),
  ('Klima aus?', 220),
  ('Kralle anschalten und Sicherungsstift raus', 230)
) as v(text, reihenfolge)
where not exists (select 1 from showcheck_punkt where bereich = 'pause');

insert into showcheck_punkt (bereich, text, reihenfolge)
select 'nach_show', text, reihenfolge from (values
  ('Münztisch laden', 10),
  ('Bühne Reinigung', 20),
  ('Rose präpariert. Klammer lösen, bevor das Rig fährt!', 30),
  ('Flying Gimmick reinholen', 40),
  ('Seil Reset', 50),
  ('Paintball CO2 leer geballert', 60),
  ('Kerze aus?', 70),
  ('Flüssigkeiten leeren und Gefäße reinigen', 80),
  ('Schwarzlichtlampe aus', 90),
  ('Bingo Bälle raus', 100),
  ('Konfetti-Kanone prep', 110),
  ('Assistentenhandy an Ladegerät', 120),
  ('Tattoo zurück in die Umkleide', 130),
  ('Bingo-Maschine reinigen', 140),
  ('Auto reinigen', 150),
  ('LED-Wall unten (für Besichtigungen)', 160),
  ('Saallicht aus', 170),
  ('Sicherungen aus, oben und unten!', 180),
  ('Zeitmaschine laden', 190)
) as v(text, reihenfolge)
where not exists (select 1 from showcheck_punkt where bereich = 'nach_show');
