-- Welche Abende schon als "kein Menue im Shop buchbar" gemeldet wurden
-- (Florian, 21.09.2026). Siehe lib/shop/menuepruefung.ts.
--
-- Ohne diese Tabelle kaeme die Meldung jeden Tag neu. Ist ein Abend wieder
-- freigeschaltet, wird die Zeile geloescht; faellt er spaeter erneut aus,
-- wird er wieder gemeldet.

create table if not exists shop_menue_meldung (
  ditix_event_id text primary key,
  datum          date,
  gemeldet_am    timestamptz not null default now()
);
