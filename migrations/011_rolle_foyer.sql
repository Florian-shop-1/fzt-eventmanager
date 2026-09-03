-- Eigene Rolle für das Foyer.
--
-- Sarah managt das Foyer. Ihre Arbeit ist eine andere als die von Küche
-- oder Büro: Stehtische vorbereiten, VIP-Bändchen ausgeben, Gäste zur
-- Eventgalerie schicken und rechtzeitig in den Saal bringen.
--
-- Sie bekommt deshalb eine eigene Rolle statt eines abgespeckten
-- Teamzugangs. So sieht sie das, was sie braucht, und nichts weiter:
-- keine Preise, keine Angebote, keine Kundendaten.

alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer'));

comment on column benutzer.rolle is
  'chef = alles inklusive Zugängen, team = Büro und Vertrieb, gastro = Küche und Sitzplan ohne Preise, foyer = Foyerdienst ohne Preise.';
