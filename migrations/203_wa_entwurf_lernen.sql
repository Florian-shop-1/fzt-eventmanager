-- Was am vorbereiteten Text geändert wurde (Florian, 24.10.2026).
--
-- "dokumentierst du mit, was wir verändern in der antwortnachricht über
-- den eventmanager, dass du daraus in einer woche lernen kannst?"
--
-- Die Entwürfe für den Schlemmerblock schreibt der Eventmanager, gegen
-- gelesen und abgeschickt werden sie von Hand. Genau dazwischen liegt
-- das Wissen: Jede Änderung ist ein Hinweis, dass der Text etwas nicht
-- trifft. Ohne Mitschrift ist dieses Wissen nach dem Absenden weg.
--
-- Festgehalten wird beides, der Entwurf und das, was wirklich hinausging,
-- dazu der Anlass und die gezogenen Codes. Verworfene Entwürfe kommen
-- ebenfalls hierher, mit leerem Versandtext: Dass jemand den Vorschlag
-- weggeworfen hat, sagt mehr als eine kleine Korrektur.

begin;

create table if not exists wa_entwurf_lernen (
  id            uuid primary key default gen_random_uuid(),
  wa_id         text not null,
  anlass        text not null default '',
  codes         text not null default '',
  entwurf       text not null,
  -- Was tatsächlich hinausging. Leer heißt: verworfen, nichts gesendet.
  gesendet      text not null default '',
  -- Grob, wie stark geändert wurde: 0 heißt unverändert, 100 neu geschrieben.
  abweichung    int not null default 0,
  wer           text not null default '',
  vorbereitet_am timestamptz,
  am            timestamptz not null default now()
);

create index if not exists wa_entwurf_lernen_am on wa_entwurf_lernen (am desc);

comment on table wa_entwurf_lernen is
  'Entwurf und tatsaechlich gesendeter Text im Vergleich, um die Vorlagen zu verbessern.';

commit;
