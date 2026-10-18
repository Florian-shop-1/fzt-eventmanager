-- Je Waschtag höchstens eine Erinnerung (Florian, 18.10.2026).
--
-- "bitte an Olena mailen, wenn nicht gewaschen wurde." Olena ist die
-- feste Kraft im Foyer; Sarah ist nur noch Aushilfe und bekommt deshalb
-- keine Mail mehr.
--
-- Ohne diese Liste käme die Mail jede Nacht neu, bis jemand wäscht, und
-- nach der dritten liest sie niemand mehr.
create table if not exists wasch_erinnert (
  termin       date primary key,
  erinnert_am  timestamptz not null default now()
);
