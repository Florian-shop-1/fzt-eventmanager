-- Der Visitenkarten-Scanner (Florian, 25.10.2026).
--
-- "wenn immer ich eine v-karte bekomme, möchte diese scannen, du legst
-- alle daten in brevo UND trägst diesen kontakt bei den magic news ein.
-- der grund ist, dass sie die magic-news wollen und mir ihre karte
-- gegeben haben. eine mündliche zustimmung wurde also erteilt."
--
-- Deshalb steht an jeder Karte, wer sie wann gescannt hat: Das ist der
-- Beleg für die mündliche Zustimmung. Abmelden können sich alle
-- jederzeit, wie bei jeder anderen Mail auch.
--
-- Das Foto bleibt liegen, bis der Kontakt übertragen ist. Wer eine
-- E-Mail-Adresse prüfen will, muss die Karte sehen können.
begin;

create table if not exists visitenkarte (
  id            uuid primary key default gen_random_uuid(),
  -- neu: gelesen, wartet auf den Menschen
  -- uebertragen: in Brevo und in den Magic News
  -- verworfen: Fehlgriff, doppelt, oder niemand, den wir anschreiben wollen
  status        text not null default 'neu',
  bild_url      text not null default '',
  vorname       text not null default '',
  nachname      text not null default '',
  firma         text not null default '',
  position      text not null default '',
  email         text not null default '',
  telefon       text not null default '',
  webseite      text not null default '',
  adresse       text not null default '',
  -- Was das Modell gelesen hat, roh, zum Nachsehen bei Zweifeln.
  gelesen       jsonb not null default '{}'::jsonb,
  -- "sicher" oder "unsicher": Bei unsicher schaut jemand genauer hin.
  sicherheit    text not null default 'unsicher',
  notiz         text not null default '',
  gescannt_von  text not null default '',
  erstellt_am   timestamptz not null default now(),
  uebertragen_am timestamptz,
  fehler        text not null default ''
);

create index if not exists visitenkarte_status on visitenkarte (status, erstellt_am desc);
-- Dieselbe Adresse nicht zweimal übertragen.
create unique index if not exists visitenkarte_email_einmal
  on visitenkarte (lower(email)) where status = 'uebertragen' and email <> '';

commit;
