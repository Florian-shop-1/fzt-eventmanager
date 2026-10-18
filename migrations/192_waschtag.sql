-- Waschtag für die Hemden (Florian, 18.10.2026).
--
-- Sarah: "Ich habe das während Doppel-Shows oder sonntags gemacht, 1 bis
-- 2 mal im Monat. Aber bitte weiterhin alle in die Körbe schmeißen, nicht
-- daneben. So kommen dann auch wirklich alle in die Waschmaschine und es
-- fehlt keins. Und bitte Ärmel runter machen, das erspart demjenigen, der
-- das übernimmt, so viel Zeit."
--
-- Fester Termin ist der erste Sonntag im Monat, der Tag mit Flo-Zirkus.
-- Festgehalten wird nur, wann zuletzt gewaschen wurde; alles andere
-- rechnet sich daraus.
create table if not exists waschtag (
  id           uuid primary key default gen_random_uuid(),
  gewaschen_am date not null,
  von          text not null default '',
  notiz        text not null default '',
  erfasst_am   timestamptz not null default now()
);

-- Wenn dem Showteam die Hemden in einer Groesse ausgehen.
--
-- "bitte beim Showteam einen Button rein: gibt keine Hemden mehr in
-- Groesse (?). Bitte dann ans Foyer, mal wieder zu waschen. Und wenn die
-- Groesse nicht da sein sollte, Info an mich, dass ich diese Groesse dann
-- kaufe."
create table if not exists hemd_meldung (
  id          uuid primary key default gen_random_uuid(),
  groesse     text not null,
  wer         text not null default '',
  gemeldet_am timestamptz not null default now(),
  erledigt_am timestamptz
);

create index if not exists hemd_meldung_offen on hemd_meldung (erledigt_am, gemeldet_am desc);
