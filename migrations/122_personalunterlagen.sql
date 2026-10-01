-- Die alten Unterlagen im Haus (Florian, 01.10.2026).
--
-- "bitte wenn man auf mitarbeiter klickt auch moeglich machen, dass man
-- diese alten vertraege angucken kann, die ich dir gegeben hab."
--
-- Die Papiervertraege und Papierboegen liegen bisher als Datei auf
-- irgendeinem Rechner. Hier liegen sie bei der Person, zu der sie
-- gehoeren, und zwar unveraendert: Ein Vertrag ist ein Beleg, und ein
-- Beleg wird nicht umgeschrieben.
--
-- Zu sehen nur fuer die, die auch die Vertraege sehen: Werner, Kevin,
-- Florian.

create table if not exists personal_datei (
  id             uuid primary key default gen_random_uuid(),
  benutzer_id    uuid not null references benutzer (id) on delete cascade,
  -- 'vertrag' oder 'bogen'
  art            text not null default 'vertrag',
  titel          text not null default '',
  dateiname      text not null default '',
  typ            text not null default 'application/pdf',
  inhalt         bytea not null,
  groesse        int not null default 0,
  notiz          text not null default '',
  -- Falls die Datei zu einem Vertrag im System gehoert.
  vertrag_id     uuid references arbeitsvertrag (id) on delete set null,
  hochgeladen_von text not null default '',
  hochgeladen_am  timestamptz not null default now()
);

create index if not exists personal_datei_person on personal_datei (benutzer_id, hochgeladen_am desc);
