-- Urlaub und private Termine im Voraus eintragen (Florian, 21.09.2026).
--
-- Die meisten im Showteam sind Nebenjobber und wissen früh, wann sie weg
-- sind. Wer das hier einträgt, dessen Schichten in dem Zeitraum werden
-- sofort ausgeschrieben, und er wird in der Zeit nicht mehr gefragt.

create table if not exists dienst_abwesend (
  id          uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references benutzer (id) on delete cascade,
  von         date not null,
  bis         date not null,
  grund       text not null default '',
  erstellt_am timestamptz not null default now()
);

create index if not exists dienst_abwesend_person on dienst_abwesend (benutzer_id, von);
create index if not exists dienst_abwesend_zeit on dienst_abwesend (bis);
