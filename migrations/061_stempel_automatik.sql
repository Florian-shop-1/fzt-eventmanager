-- Ausstempeln, auch wenn der Eventmanager zu ist (Florian, 21.09.2026).
--
-- Zwei Wege, weil ein Browser im Hintergrund kein GPS lesen darf:
--
--  1. Der Nachtabschluss: Wer am Ende des Tages noch eingestempelt ist,
--     wird zur hinterlegten Feierabendzeit ausgestempelt. Ohne Handy,
--     ohne Standort, einfach als Schlussstrich.
--  2. Ein persoenlicher Link je Mitarbeiter. Den haengt man am iPhone in
--     einen Kurzbefehl ("Wenn ich diesen Ort verlasse") oder bei Android
--     in eine Automation. Das Handy ruft den Link im Hintergrund auf, der
--     Server stempelt aus. Der Link kann nur ausstempeln, sonst nichts.

alter table stempel_einstellung add column if not exists feierabend text not null default '23:45';

create table if not exists stempel_token (
  benutzer_id uuid primary key references benutzer (id) on delete cascade,
  token       text not null unique,
  erstellt_am timestamptz not null default now(),
  benutzt_am  timestamptz
);
