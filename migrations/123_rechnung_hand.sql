-- Rechnungen von Hand und die freundliche Erinnerung (Florian, 01.10.2026).
--
-- "bei ausgangsrechnung soll es möglich sein, dass wir eine von hand
-- erstellen ... da natürlich auch die eingänge auf dem konto abgleichen
-- und nach ablauf der 14 Tage eine freundliche erinnerung an den kunden
-- senden".
--
-- Bisher entstand eine Rechnung nur aus einem Angebot, und die Anschrift
-- kam über den Vorgang vom Kunden. Eine Rechnung ohne Vorgang braucht
-- ihre eigene Anschrift, sonst steht im Brief nur ein Name.

alter table rechnung add column if not exists kunde_anschrift jsonb;

-- Wann zuletzt erinnert wurde und wie oft. Beides zusammen verhindert,
-- dass jemand jeden Morgen eine Mahnung bekommt.
alter table rechnung add column if not exists erinnert_am timestamptz;
alter table rechnung add column if not exists erinnerungen int not null default 0;
