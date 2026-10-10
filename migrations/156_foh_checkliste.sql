-- Die Checkliste am Pult: FOH, ULMFASSBAR.
--
-- Übernommen aus der Liste, die bisher auf dem Lichtpult stand (Foto
-- von Florian, 10.10.2026). Dieselben Abschnitte wie hinter der Bühne,
-- damit beide denselben Abend in derselben Reihenfolge abarbeiten.
--
-- Zwei Punkte kommen aus Florians Nachtrag und stehen bewusst am Ende:
-- die Zeitmaschine als vorletzter, die Klimaanlage als allerletzter.
-- Was man zuletzt abhakt, bevor es losgeht, soll auch zuletzt
-- dastehen.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'vor_show', t, r, 'foh'
  from (values
    (10,  'Fixtures testen'),
    (20,  'Headset Main: Akkus + Soundcheck, danach Florian in die Umkleide legen'),
    (30,  'Headset Spare: Akkus + Soundcheck'),
    (40,  'Handset: Akkus + Soundcheck'),
    (50,  'Handkamera: Akku reinstecken und schauen, ob sie funktioniert'),
    (60,  'Bodennebel: Eis und Fluid auffüllen'),
    (70,  'Stufenleuchten an'),
    (80,  'Lila Hazer an'),
    (90,  'Hazer an, genug Haze im Showroom (vor LED)'),
    (100, 'UV-Taschenlampe im Rack an'),
    (110, 'Mikro Tattoo bereit'),
    (120, 'Brandmeldeanlage ausschalten'),
    (130, 'Bewegungsmelder aus (am Panel auf AN stellen)'),
    (140, 'Bingo-Check'),
    (150, 'Zeitmaschine einschalten'),
    (160, 'Klimaanlage ausschalten')
  ) as p(r, t)
 where not exists (
   select 1 from showcheck_punkt x where x.liste = 'foh' and x.bereich = 'vor_show' and x.text = p.t
 );

-- In der Pause: nur das eine, dafür zeitkritisch.
insert into showcheck_punkt (bereich, text, reihenfolge, liste)
select 'pause', 'Eiswürfel holen für die Nebelmaschine', 10, 'foh'
 where not exists (
   select 1 from showcheck_punkt x where x.liste = 'foh' and x.text like 'Eiswürfel holen%'
 );
