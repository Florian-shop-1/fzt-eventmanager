-- Magicuvée-Bestellungen der Gastronomie (Florian, 19.09.2026).
--
-- Die Gastro (Giusi, Osman ...) bestellt Wein beim Theater. Florian, Kevin
-- und Sarah sehen die Bestellung, wer den Wein übergibt, hakt ab. Einmal im
-- Monat wird abgerechnet.
--
-- Solange "freigegeben" aus ist, sieht den Bereich nur Florian.

create table if not exists wein_artikel (
  id          text primary key,
  name        text not null,
  -- Verkaufspreis an Gäste, brutto, nur zur Orientierung.
  vk_cent     int  not null,
  -- Preis für die Gastro, netto. Darauf kommt auf der Rechnung die Umsatzsteuer.
  ek_cent     int  not null,
  aktiv       boolean not null default true,
  sortierung  int not null default 0
);

insert into wein_artikel (id, name, vk_cent, ek_cent, sortierung) values
  ('weiss',     'Magicuvée Weiß',      3490, 698, 1),
  ('rose',      'Magicuvée Rosé',      3590, 718, 2),
  ('rot',       'Magicuvée Rot',       3690, 738, 3),
  ('prickelnd', 'Magicuvée Prickelnd', 4250, 850, 4)
on conflict (id) do nothing;

create table if not exists wein_bestellung (
  id              uuid primary key default gen_random_uuid(),
  besteller_id    uuid references benutzer (id) on delete set null,
  besteller_name  text not null,
  erstellt_am     timestamptz not null default now(),
  notiz           text not null default '',
  status          text not null default 'offen' check (status in ('offen', 'uebergeben', 'storniert')),
  uebergeben_am   timestamptz,
  uebergeben_von  text,
  storniert_am    timestamptz,
  storniert_von   text
);

create index if not exists wein_bestellung_status on wein_bestellung (status, erstellt_am);

-- Positionen mit dem Preis zum Zeitpunkt der Bestellung. Ändert Florian
-- später die Preise, bleiben alte Bestellungen, wie sie waren.
create table if not exists wein_position (
  bestellung_id uuid not null references wein_bestellung (id) on delete cascade,
  artikel_id    text not null references wein_artikel (id),
  name          text not null,
  menge         int  not null check (menge between 1 and 500),
  ek_cent       int  not null,
  primary key (bestellung_id, artikel_id)
);

create table if not exists wein_einstellung (
  id            int primary key default 1 check (id = 1),
  freigegeben   boolean not null default false,
  -- Wer bei einer neuen Bestellung Bescheid bekommt.
  melden_an     uuid[] not null default '{}'
);
insert into wein_einstellung (id) values (1) on conflict (id) do nothing;
