-- Die Putzfirma stempelt mit.
--
-- Ileri kommt mit wechselnd vielen Leuten, und abgerechnet wird nach
-- Stunden: 20 Euro netto je Person und Stunde (Florian, 07.10.2026).
-- Bisher stand dem nur die Rechnung gegenüber, die das Büro glauben
-- musste. Jetzt stempelt die Firma selbst, sagt beim Einstempeln, wie
-- viele sie heute sind, und die Rechnung lässt sich dagegenhalten.
--
-- Ein Zugang für die Firma, nicht für einzelne Personen: Wer von Ileri
-- putzt, ist unsere Sache nicht, die Zahl dagegen schon.
alter table benutzer drop constraint if exists benutzer_rolle_check;
alter table benutzer add constraint benutzer_rolle_check
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk', 'agentur', 'buchhaltung', 'reinigung'));

-- Was die Stunde kostet. Nur für Dienstleister, die nach Stunden
-- abrechnen; bei Angestellten steht der Lohn im Arbeitsvertrag.
alter table benutzer add column if not exists stundensatz_cent integer;

comment on column benutzer.stundensatz_cent is
  'Nettostundensatz eines externen Dienstleisters in Cent. Leer bei Angestellten, deren Lohn im Arbeitsvertrag steht.';

-- Wie viele Leute der Firma zu dieser Schicht da sind.
alter table stempel add column if not exists personen integer;

comment on column stempel.personen is
  'Nur bei Dienstleistern: Anzahl der Leute, die zu dieser Schicht gekommen sind. Leer bei eigenen Mitarbeitern, die immer für sich stempeln.';
