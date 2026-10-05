-- Die To-Do-Liste des Foyers, nach demselben Muster wie der Show-Check.
--
-- "wir machen das nun so wie in der show.. sie müssen abhaken und wir
-- kontrollieren es dann" (Florian, 05.10.2026). Dieselben Tabellen, nur
-- eine zweite Liste: So gibt es einen Weg zum Abhaken und nicht zwei.
--
-- Die Zeiten stammen aus Florians PDF "Foyer to do" und beziehen sich auf
-- einen Abend mit Show um 20:00 Uhr.
alter table showcheck_punkt add column if not exists liste text not null default 'show';

-- Die Pruefung kannte nur die drei Abschnitte der Show. Das Foyer hat
-- sechs, entlang des Abends.
alter table showcheck_punkt drop constraint if exists showcheck_punkt_bereich_check;

alter table showcheck_punkt add constraint showcheck_punkt_bereich_check
  check (bereich in (
    'vor_show', 'pause', 'nach_show',
    'foyer_vor', 'foyer_einlass', 'foyer_akt1', 'foyer_pause', 'foyer_akt2', 'foyer_ende'
  ));

create index if not exists showcheck_punkt_liste_idx on showcheck_punkt (liste, bereich, reihenfolge);

insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select x.bereich, x.text, x.reihenfolge, 'foyer'
  from (values
    ('foyer_vor',     'Einstempeln',                                            10),
    ('foyer_vor',     'Lichter an',                                             20),
    ('foyer_vor',     'Kühltheken und Kaffeemaschine an',                       30),
    ('foyer_vor',     'Parkplatzschilder drucken und bestücken',                40),
    ('foyer_vor',     'Obst schneiden',                                         50),
    ('foyer_vor',     'Popcorn in die Maschine',                                60),
    ('foyer_vor',     'Flos Kühlschrank auffüllen',                             70),
    ('foyer_vor',     'Schauen, dass die Musik läuft',                          80),
    ('foyer_vor',     'Geld holen, Kassensystem starten',                       90),

    ('foyer_einlass', 'Tür öffnen',                                             10),
    ('foyer_einlass', 'Um die Gäste kümmern (Getränke, Popcorn)',               20),
    ('foyer_einlass', 'Vorbestellungen aufnehmen',                              30),

    ('foyer_akt1',    'Postkarten bekleben und auslegen',                       10),
    ('foyer_akt1',    'Kühlschränke und Theken auffüllen, wenn nötig',          20),
    ('foyer_akt1',    'Vorbestellungen herrichten, mit Schild, Namen und Bestellung', 30),
    ('foyer_akt1',    'Popcorn auffüllen, falls nötig',                         40),
    ('foyer_akt1',    'Stehtisch vorbereiten',                                  50),

    ('foyer_pause',   'Service ist bei den Gästen (Getränke, Popcorn)',         10),

    ('foyer_akt2',    'Foyer aufräumen',                                        10),
    ('foyer_akt2',    'Flos Kühlschrank auffüllen',                             20),
    ('foyer_akt2',    'Leergut wegbringen',                                     30),
    ('foyer_akt2',    'Kaffeemaschine sauber machen',                           40),
    ('foyer_akt2',    'Bingo-Getränke bereitstellen (Softgetränke und Sekt)',   50),
    ('foyer_akt2',    'Popcorn raus',                                           60),

    ('foyer_ende',    '1. Person: Bingogetränke',                               10),
    ('foyer_ende',    '2. Person: Garderobe (im Herbst und Winter auch)',       20),
    ('foyer_ende',    'Aufräumen',                                              30),
    ('foyer_ende',    'Spülmaschine ausmachen',                                 40),
    ('foyer_ende',    'Tagesabschluss: Kasse und EC-Gerät',                     50),
    ('foyer_ende',    'Wenn alle Gäste weg sind: Türen zu',                     60),
    ('foyer_ende',    'Audio-Anlage aus',                                       70),
    ('foyer_ende',    'Geld und Abschlüsse ins Büro',                           80),
    ('foyer_ende',    'Geldbeutel ins Büro',                                    90),
    ('foyer_ende',    'Zentral aus',                                           100),
    ('foyer_ende',    'Ausstempeln',                                           110)
  ) as x(bereich, text, reihenfolge)
 where not exists (select 1 from showcheck_punkt p where p.liste = 'foyer');

-- Was den Mitarbeitern auf einer Liste fehlt.
--
-- "sollen die mitarbeiter vorschläge einreichen können: Fehlt was auf der
-- checkliste? verbesserung vorschlagen" (Florian, 05.10.2026). Wer am
-- Abend merkt, dass ein Handgriff fehlt, soll ihn sofort loswerden, statt
-- ihn bis zur naechsten Besprechung mit sich herumzutragen.
create table if not exists checkliste_vorschlag (
  id          uuid primary key default gen_random_uuid(),
  -- 'show' oder 'foyer'
  liste       text not null,
  text        text not null,
  von         text not null default '',
  benutzer_id uuid references benutzer(id) on delete set null,
  angelegt_am timestamptz not null default now(),
  -- Wann Florian ihn uebernommen oder abgelehnt hat.
  erledigt_am timestamptz,
  erledigt_von text
);

create index if not exists checkliste_vorschlag_offen_idx
  on checkliste_vorschlag (liste, angelegt_am) where erledigt_am is null;
