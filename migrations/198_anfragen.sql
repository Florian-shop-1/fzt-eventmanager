-- Anfragen (Website und Meta-Leadformulare) in der eigenen Datenbank (Julian, 20.10.2026).
--
-- Bisher war die Google-Tabelle "Neukundengewinnung - Eventanfragen" die Quelle,
-- der Eventmanager las sie nur. "wir wollen uns von den google tabellen loesen"
-- (Florian, 14.10.2026). Jetzt kommt jede Anfrage ueber /api/anfrage hierher.
-- Der Schluessel ist derselbe wie bisher (Datum, Adresse, Name), damit
-- lead_stand und anfrage_gemeldet weiter gelten. Siehe src/lib/db/anfragen.ts,
-- dort steht dasselbe SQL fuer den Fall, dass die Migration noch fehlt.

begin;

create table if not exists anfrage (
  id               uuid        primary key default gen_random_uuid(),
  schluessel       text        not null unique,
  eingang_am       timestamptz not null default now(),
  eingang          text        not null,
  kanal            text        not null default 'webseite',
  typ              text        not null default '',
  name             text        not null default '',
  email            text        not null default '',
  telefon          text        not null default '',
  teilnehmer       text        not null default '',
  wunschdatum      text        not null default '',
  kommentar        text        not null default '',
  status           text        not null default 'Anfrage eingegangen',
  ablehnungsgrund  text        not null default '',
  umsatz           text        not null default '',
  quelle_source    text        not null default '',
  quelle_medium    text        not null default '',
  quelle_campaign  text        not null default '',
  quelle_content   text        not null default '',
  quelle_term      text        not null default '',
  roh              jsonb       not null default '{}'::jsonb,
  inhalt_md5       text        not null default ''
);

create index if not exists anfrage_eingang on anfrage (eingang_am desc);

create unique index if not exists anfrage_dublette on anfrage (inhalt_md5) where inhalt_md5 <> '';

commit;
