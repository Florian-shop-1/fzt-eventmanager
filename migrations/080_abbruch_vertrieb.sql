-- Kleine Vertriebsstrecke für die abgebrochenen Warenkörbe
-- (Florian, 23.09.2026).
--
-- Die Körbe sind im Schnitt 273 Euro groß, das sind Gruppen und Familien.
-- Bei dem Wert lohnt ein Anruf, und dafür braucht es das Minimum, das
-- jede Vertriebsliste braucht: Wer kümmert sich, wie weit ist es, und was
-- war beim letzten Mal.
--
-- Die Stufen sind bewusst nicht nur "verkauft / nicht verkauft": Der
-- häufigste Fall im Alltag ist "angerufen, niemand dran". Ohne eigene
-- Stufe dafür landet so ein Vorgang entweder fälschlich bei "nicht
-- verkauft" oder bleibt für immer unbearbeitet liegen.
--
--   neu             noch niemand dran
--   anrufen         vorgemerkt, wird angerufen
--   nicht_erreicht  versucht, niemand erreicht (mit Wiedervorlage)
--   im_gespraech    erreicht, überlegt noch
--   gewonnen        hat gebucht
--   verloren        will nicht
--   unqualifiziert  kein echter Interessent (Test, Dublette, Zahlendreher)

alter table shop_buchung
  add column if not exists vertrieb_status text not null default 'neu',
  add column if not exists vertrieb_wer    uuid references benutzer (id) on delete set null,
  add column if not exists vertrieb_notiz  text not null default '',
  add column if not exists vertrieb_am     timestamptz,
  add column if not exists wiedervorlage   date;

alter table shop_buchung drop constraint if exists shop_buchung_vertrieb_status;
alter table shop_buchung add constraint shop_buchung_vertrieb_status
  check (vertrieb_status in ('neu','anrufen','nicht_erreicht','im_gespraech','gewonnen','verloren','unqualifiziert'));

create index if not exists shop_buchung_vertrieb on shop_buchung (vertrieb_status, wiedervorlage);

-- Was passiert ist, Zeile für Zeile. Wird nur ergänzt, nie geändert:
-- Wer später fragt, warum jemand nicht gekauft hat, liest hier nach.
create table if not exists abbruch_verlauf (
  id         uuid primary key default gen_random_uuid(),
  buchung_id uuid not null references shop_buchung (id) on delete cascade,
  wer        text not null,
  text       text not null,
  am         timestamptz not null default now()
);

create index if not exists abbruch_verlauf_buchung on abbruch_verlauf (buchung_id, am);
