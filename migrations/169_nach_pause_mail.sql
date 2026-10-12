-- Wem wir nach der Pause geschrieben haben (Florian, 12.10.2026).
--
-- "schick einfach ne mail dann, dass er sieht dass er ausser plan noch
-- eingestempelt ist, kann dann feedback geben". Damit niemand alle
-- zehn Minuten dieselbe Mail bekommt, steht hier je Abend und Person
-- eine Zeile.
create table if not exists nach_pause_mail (
  datum       date not null,
  benutzer_id uuid not null references benutzer(id) on delete cascade,
  gesendet_am timestamptz not null default now(),
  primary key (datum, benutzer_id)
);
