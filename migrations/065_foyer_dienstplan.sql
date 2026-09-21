-- Dienstplan fuers Foyer (Florian, 22.09.2026).
--
-- Sarah plant den Foyerdienst. Zwei Leute je Showtag, Zeiten nach ihrer
-- Aufstellung: Die erste Person kommt frueher, die zweite kurz danach,
-- an Tagen mit zwei Shows gibt es dazwischen eine Pause.
--
-- Fest angestellt ist nur eine Mitarbeiterin. Alles andere sind
-- Aushilfen, und die darf Sarah nicht allein einteilen: Kevin oder
-- Florian geben sie frei. Deshalb haengt an jedem Eintrag ein Stand der
-- Freigabe, und ohne Freigabe gilt niemand als eingeteilt.

create table if not exists foyer_person (
  benutzer_id uuid primary key references benutzer (id) on delete cascade,
  -- Fest angestellt: darf ohne Rueckfrage eingeteilt werden.
  fest        boolean not null default false,
  angelegt_am timestamptz not null default now()
);

create table if not exists foyer_dienst (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null,
  -- 1. Person, 2. Person, bei Bedarf eine dritte.
  nummer        int not null check (nummer between 1 and 3),
  benutzer_id   uuid references benutzer (id) on delete set null,
  von           text,
  bis           text,
  freigabe      text not null default 'nicht_noetig'
                check (freigabe in ('nicht_noetig', 'angefragt', 'frei', 'abgelehnt')),
  freigabe_von  text,
  freigabe_am   timestamptz,
  notiz         text not null default '',
  geaendert_von text,
  geaendert_am  timestamptz not null default now(),
  unique (datum, nummer)
);

create index if not exists foyer_dienst_datum on foyer_dienst (datum);
