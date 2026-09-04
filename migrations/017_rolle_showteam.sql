-- Eigene Rolle für das Showteam.
--
-- Das Showteam steht am Abend im Haus: Front of House und die beiden
-- Techniker. Ihre Arbeit hat mit Küche, Angeboten und Versand nichts zu
-- tun, mit dem Saal dagegen alles.
--
-- Sie brauchen den Saalplan, die Einlassliste, den Blick auf kommende
-- Abende und vor allem die Upgrades: An schwach verkauften Abenden holen
-- sie die Gäste aus den hinteren Reihen nach vorn, damit der Saal von der
-- Bühne aus voll wirkt.
--
-- Preise sehen sie keine. Sie brauchen keine.

alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam'));

comment on column benutzer.rolle is
  'chef = alles inklusive Zugängen, team = Büro und Vertrieb, gastro = Küche und Sitzplan ohne Preise, foyer = Foyerdienst ohne Preise, showteam = Saal und Upgrades ohne Preise.';
