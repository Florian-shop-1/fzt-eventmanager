-- Ein Link für die Putzfirma, ohne Anmeldung.
--
-- Der gemeinsame Zugang hat einen Haken: Er kennt nur eine Zahl, nicht
-- die Leute. Wenn jemand anders kommt, steht es nirgends. Deshalb ein
-- offener Link, auf dem jeder seinen Namen wählt oder hinschreibt und
-- für sich stempelt: "ich möchte so einen allgemeinen link, dass die
-- sich selber anmelden können ... bzw. jeder mitarbeiter könnte
-- einstempeln" (Florian, 07.10.2026).
--
-- Der lange Zufallsschlüssel im Link ist der Nachweis, wie bei der
-- Angebotsseite für Kunden. Zu holen gibt es dahinter nichts: nur die
-- eigene Stempeluhr, und gestempelt wird weiterhin nur auf dem Gelände.
--
-- Ein neuer Schlüssel schaltet den alten ab, falls der Link einmal
-- irgendwo landet, wo er nicht hingehört.
create table if not exists reinigung_link (
  schluessel  text primary key,
  benutzer_id uuid not null references benutzer (id) on delete cascade,
  angelegt_am timestamptz not null default now(),
  angelegt_von text not null default '',
  aus_am      timestamptz
);

create index if not exists reinigung_link_firma
  on reinigung_link (benutzer_id) where aus_am is null;
