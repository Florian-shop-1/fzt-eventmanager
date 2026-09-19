-- Neben Bewirtungen auch andere Belege: Einkäufe im Baumarkt, Büro, Tanken
-- (Florian, 19.09.2026). Dieselbe Tabelle, dieselben GoBD-Regeln.
--
-- art        bewirtung oder einkauf
-- kategorie  wofür (Bühne und Technik, Büro, Deko ...), nur bei Einkäufen
-- zweck      kurz, was gekauft wurde und wofür
-- zahlweg    karte oder bar. Steht es nicht auf dem Beleg, fragt das Programm.
-- privat_ausgelegt  mit eigenem Geld bezahlt, die Firma muss erstatten

alter table bewirtung add column if not exists art text not null default 'bewirtung'
  check (art in ('bewirtung', 'einkauf'));
alter table bewirtung add column if not exists kategorie text not null default '';
alter table bewirtung add column if not exists zweck text not null default '';
alter table bewirtung add column if not exists zahlweg text not null default ''
  check (zahlweg in ('', 'karte', 'bar'));
alter table bewirtung add column if not exists privat_ausgelegt boolean not null default false;

-- Der Schutz vergleicht jetzt die ganze Zeile: Nach dem Festschreiben darf
-- sich außer den Storno-Feldern nichts mehr ändern, auch keine neue Spalte.
create or replace function bewirtung_schutz() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.status <> 'entwurf' then
    raise exception 'Festgeschriebene Belege dürfen nicht gelöscht werden, nur storniert.'; -- (im Funktionsrumpf)
  end if; -- (im Funktionsrumpf)
  if tg_op = 'UPDATE' and old.status = 'fertig' then
    if new.status <> 'storniert'
       or (to_jsonb(new) - 'status' - 'storniert_am' - 'storniert_von' - 'storno_grund')
          is distinct from
          (to_jsonb(old) - 'status' - 'storniert_am' - 'storniert_von' - 'storno_grund') then
      raise exception 'Festgeschriebene Belege dürfen nicht geändert werden, nur storniert.'; -- (im Funktionsrumpf)
    end if; -- (im Funktionsrumpf)
  end if; -- (im Funktionsrumpf)
  if tg_op = 'UPDATE' and old.status = 'storniert' then
    raise exception 'Stornierte Belege bleiben, wie sie sind.'; -- (im Funktionsrumpf)
  end if; -- (im Funktionsrumpf)
  return coalesce(new, old); -- (im Funktionsrumpf)
end $$;
