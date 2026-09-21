-- Stempeluhr (Florian, 21.09.2026).
--
-- Die Mitarbeiter stempeln im Eventmanager Kommen, Pause und Gehen.
-- Gestempelt werden kann nur, wer laut GPS auf dem Gelände ist: Es gibt
-- kein Homeoffice. Wer das Gelände verlässt, ohne auszustempeln, wird
-- gemeldet, siehe stempel_einstellung.melden_an.
--
-- Jeder Stempel merkt sich, wo er gesetzt wurde, wie genau das Signal war
-- und ob der Punkt im erlaubten Umkreis lag. So bleibt nachvollziehbar,
-- warum ein Stempel angenommen oder abgelehnt wurde.

create table if not exists stempel (
  id           uuid primary key default gen_random_uuid(),
  benutzer_id  uuid not null references benutzer (id) on delete cascade,
  name         text not null,
  art          text not null check (art in ('kommen', 'pause_start', 'pause_ende', 'gehen')),
  zeitpunkt    timestamptz not null default now(),
  lat          double precision,
  lon          double precision,
  genauigkeit  double precision,
  entfernung_m double precision,
  im_haus      boolean not null default true,
  -- 'app' für den Knopf, 'auto' für einen Stempel, den das System gesetzt hat.
  quelle       text not null default 'app',
  notiz        text not null default ''
);

create index if not exists stempel_benutzer on stempel (benutzer_id, zeitpunkt desc);
create index if not exists stempel_zeit on stempel (zeitpunkt desc);

-- Wo das Haus steht und wie weit man sich entfernen darf.
create table if not exists stempel_einstellung (
  id            int primary key default 1 check (id = 1),
  lat           double precision not null default 48.3842057,
  lon           double precision not null default 10.0083344,
  radius_m      int not null default 150,
  -- Wer eine Meldung bekommt, wenn jemand das Gelände verlässt oder zu lange
  -- eingestempelt ist. Standard: Florian und Kevin.
  melden_an     uuid[] not null default '{}',
  -- Nach so vielen Stunden ohne Ausstempeln kommt eine Meldung.
  max_stunden   int not null default 10,
  aktiv         boolean not null default true
);
insert into stempel_einstellung (id) values (1) on conflict (id) do nothing;

-- Eine laufende Schicht, die schon gemeldet wurde, wird nicht erneut
-- gemeldet. Der Verweis zeigt auf den Kommen-Stempel.
create table if not exists stempel_meldung (
  kommen_id  uuid primary key references stempel (id) on delete cascade,
  grund      text not null,
  gemeldet_am timestamptz not null default now()
);
