-- Eigene Rolle für den Food-Kiosk.
--
-- Arnivan betreibt ab Herbst 2026 einen Food-Kiosk vor dem Theater und
-- liefert die Zauberschnitten (Pinsa) und Fingerfood-Teller kurz vor der
-- Pause fertig an die Stehtische. Er ist kein Mitarbeiter, sondern ein
-- externer Partner.
--
-- Er sieht deshalb genau eine Seite: wie viele Stehtische an welchem Abend
-- gebucht sind, und wann ungefähr die Pause ist. Keine Gästezahlen, keine
-- Namen, keine Preise, keine Kundendaten.

alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk'));

comment on column benutzer.rolle is
  'chef = alles inklusive Zugängen, team = Büro und Vertrieb, gastro = Küche und Sitzplan ohne Preise, foyer = Foyerdienst ohne Preise, showteam = Saal und Upgrades ohne Preise, kiosk = externer Food-Kiosk, nur Stehtische je Abend.';
