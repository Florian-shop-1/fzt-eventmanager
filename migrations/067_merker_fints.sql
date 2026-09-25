-- Erinnerung an die FinTS-Registrierungsnummer (Florian, 22.09.2026).
--
-- Die Banken lassen seit 2019 nur registrierte Programme an FinTS. Die
-- Nummer kommt in 10 bis 15 Werktagen von der FinTS-Leitstelle. Bis
-- dahin laeuft der Abgleich ueber die hochgeladene Umsatzdatei, danach
-- reicht ein Wert und der Abruf holt die Umsaetze allein.

insert into merker (benutzer_id, schluessel, titel, text, link, wieder_am)
select id, 'fints-registrierung',
       'FinTS-Registrierungsnummer eintragen',
       'Das ausgefüllte Formular ging an registrierung@hbci-zka.de. Sobald die Nummer da ist: auf dem Rechner im Büro "Bankzugang eintragen" öffnen, dort die Nummer hinterlegen, danach holt sich der Eventmanager die Kontoumsätze zweimal täglich von selbst. Bis dahin: Umsätze im OnlineBanking exportieren und hier hochladen.',
       '/zahlungseingaenge',
       current_date + 12
  from benutzer where lower(email) = 'info@florianzimmer.com'
on conflict (benutzer_id, schluessel) do nothing;
