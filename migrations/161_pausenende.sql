-- Wann die Pause zu Ende ist, und wer danach noch da ist.
--
-- Zwei Dinge hängen daran (Florian, 11.10.2026):
--
-- 1. Florian drückt am Ende der Pause einen Knopf. Daraus lernt das
--    Programm, wann die Pause bei der ULMFASSBAR üblicherweise endet.
--    Heute steht in der Foyer-Checkliste eine geschätzte Zeit; mit ein
--    paar Abenden steht dort die echte.
--
-- 2. Nach der Pause bleibt im Foyer nur eine Kraft. Wer dann noch
--    eingestempelt ist, wird gefragt, warum. "das problem ist, dass die
--    einfach da bleiben und nichts zu tun haben."
create table if not exists pausenende (
  id             uuid primary key default gen_random_uuid(),
  datum          date not null,
  ditix_event_id text not null default '',
  -- Wann die Pause zu Ende war.
  zeitpunkt      timestamptz not null default now(),
  -- Wie viele Minuten nach Showbeginn. Daraus wird gelernt.
  nach_beginn_min integer,
  von            text not null default ''
);

create index if not exists pausenende_datum on pausenende (datum desc);

-- Warum jemand nach der Pause geblieben ist.
--
-- Die Zeit nach der Pause steht in keinem Dienstplan und ist nicht
-- budgetiert. Bezahlt wird sie nur, wenn ein Grund dasteht und jemand
-- sie nachträglich genehmigt. Deshalb wird hier beides festgehalten.
create table if not exists nach_pause_grund (
  id          uuid primary key default gen_random_uuid(),
  datum       date not null,
  benutzer_id uuid references benutzer (id) on delete set null,
  name        text not null default '',
  grund       text not null,
  gemeldet_am timestamptz not null default now(),
  -- Vom Büro nachträglich genehmigt, oder nicht.
  genehmigt   boolean,
  entschieden_von text,
  entschieden_am  timestamptz
);

create index if not exists nach_pause_grund_datum on nach_pause_grund (datum desc);
