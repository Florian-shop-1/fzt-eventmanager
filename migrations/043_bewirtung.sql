-- Bewirtungsbelege und die Rolle "buchhaltung" (Florian, 19.09.2026).
--
-- Nur Florian und sein Vater (Rolle buchhaltung) sehen diesen Bereich.
-- Florian fotografiert den Beleg im Restaurant, Claude liest ihn aus,
-- Florian ergänzt Anlass und Teilnehmer.
--
-- GoBD: Ein fertiger Beleg wird festgeschrieben und danach nicht mehr
-- geändert. Das Foto bleibt unverändert gespeichert, sein Fingerabdruck
-- (SHA-256) steht daneben. Fehler werden nicht gelöscht, sondern storniert,
-- mit Grund, und neu erfasst. So bleibt nachvollziehbar, was wann war.

alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk', 'buchhaltung'));

create table if not exists bewirtung (
  id                 uuid primary key default gen_random_uuid(),
  -- Laufende Nummer für das Steuerbüro, pro Jahr lückenlos (B-2026-001).
  nummer             text unique,
  erstellt_am        timestamptz not null default now(),
  erstellt_von       text not null,

  foto               bytea not null,
  foto_typ           text not null default 'image/jpeg',
  foto_hash          text not null,

  -- Vom Beleg (Claude liest vor, Florian prüft).
  datum              date,
  restaurant         text not null default '',
  anschrift          text not null default '',
  brutto_cent        int,          -- Rechnungsbetrag laut Beleg, ohne Trinkgeld
  mwst7_cent         int not null default 0,
  mwst19_cent        int not null default 0,
  trinkgeld_cent     int not null default 0,
  zahlart            text not null default '',

  -- Pflichtangaben für den Bewirtungsbeleg (§ 4 Abs. 5 Nr. 2 EStG).
  anlass             text not null default '',
  teilnehmer         text not null default '',
  bewirtender        text not null default 'Florian Zimmer',
  ort_der_bewirtung  text not null default '',

  lesung             jsonb,        -- was Claude gelesen hat, zur Nachvollziehbarkeit
  notiz              text not null default '',

  -- entwurf: gerade gescannt, noch zu ergänzen. fertig: festgeschrieben.
  status             text not null default 'entwurf' check (status in ('entwurf', 'fertig', 'storniert')),
  festgeschrieben_am timestamptz,
  festgeschrieben_von text,
  storniert_am       timestamptz,
  storniert_von      text,
  storno_grund       text
);

create index if not exists bewirtung_datum on bewirtung (datum);
create unique index if not exists bewirtung_foto on bewirtung (foto_hash) where status <> 'storniert';

-- Festgeschriebene Belege sind unveränderbar. Erlaubt ist nur noch das
-- Stornieren. Das prüft die Datenbank selbst, nicht nur das Programm.
create or replace function bewirtung_schutz() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.status <> 'entwurf' then
    raise exception 'Festgeschriebene Bewirtungsbelege dürfen nicht gelöscht werden, nur storniert.'; -- (im Funktionsrumpf)
  end if; -- (im Funktionsrumpf)
  if tg_op = 'UPDATE' and old.status = 'fertig' then
    if new.status <> 'storniert'
       or new.foto is distinct from old.foto or new.datum is distinct from old.datum
       or new.brutto_cent is distinct from old.brutto_cent or new.trinkgeld_cent is distinct from old.trinkgeld_cent
       or new.anlass is distinct from old.anlass or new.teilnehmer is distinct from old.teilnehmer
       or new.restaurant is distinct from old.restaurant then
      raise exception 'Festgeschriebene Bewirtungsbelege dürfen nicht geändert werden, nur storniert.'; -- (im Funktionsrumpf)
    end if; -- (im Funktionsrumpf)
  end if; -- (im Funktionsrumpf)
  if tg_op = 'UPDATE' and old.status = 'storniert' then
    raise exception 'Stornierte Bewirtungsbelege bleiben, wie sie sind.'; -- (im Funktionsrumpf)
  end if; -- (im Funktionsrumpf)
  return coalesce(new, old); -- (im Funktionsrumpf)
end $$;

drop trigger if exists bewirtung_schutz on bewirtung;
create trigger bewirtung_schutz before update or delete on bewirtung
  for each row execute function bewirtung_schutz();
