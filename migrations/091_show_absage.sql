-- Eine Show absagen und die Gäste umleiten (Florian, 29.09.2026).
--
-- show_absage haelt fest, dass eine Vorstellung ausfaellt. absage_gast ist
-- je betroffener Buchung eine Zeile: die Ausgangslage (Kategorie), die
-- Entschaedigung (Upgrade oder Glas), der Mailentwurf zum Pruefen vor dem
-- Versand, und was der Gast am Ende gewaehlt hat. Ditix selbst kann diese
-- App nicht umbuchen (nur lesender Zugriff), deshalb bekommt das Büro eine
-- Aufgabe, das von Hand nachzuziehen.

create table if not exists show_absage (
  id             uuid primary key default gen_random_uuid(),
  ditix_event_id text not null unique,
  datum          date not null,
  uhrzeit        text not null,
  show           text not null,
  grund          text not null default 'aus produktionstechnischen Gründen',
  abgesagt_von   text not null,
  abgesagt_am    timestamptz not null default now()
);

create table if not exists absage_gast (
  id                     uuid primary key default gen_random_uuid(),
  absage_id              uuid not null references show_absage (id) on delete cascade,
  buchung_id             uuid references shop_buchung (id),
  name                   text not null,
  email                  text not null,
  plaetze                integer not null default 1,
  alte_kategorie         text not null,
  kompensation_art       text not null check (kompensation_art in ('upgrade', 'glas')),
  neue_kategorie         text,
  zugang_token           text not null unique,
  entwurf_betreff        text not null,
  entwurf_text           text not null,
  versendet_am           timestamptz,
  gewaehlter_termin_id   text,
  gewaehlter_termin_name text,
  gewaehlt_am            timestamptz,
  umgebucht_von          text,
  umgebucht_am           timestamptz,
  erstellt_am            timestamptz not null default now()
);

create index if not exists absage_gast_absage on absage_gast (absage_id);
create index if not exists absage_gast_buchung on absage_gast (buchung_id);
