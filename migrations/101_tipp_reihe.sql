-- Mehrteilige Anleitungen bei Tipps & Tricks (Florian, 29.09.2026).
--
-- Manches lässt sich nicht in einem Video erklären. "Show einschalten"
-- sind mehrere Schritte, jeder ein kurzes Video, und man muss sie in der
-- richtigen Reihenfolge sehen, sonst ergibt es keinen Sinn.
--
-- Bisher wäre daraus eine Handvoll einzelner Videos in der Liste
-- geworden, in zufälliger Reihenfolge und ohne erkennbaren Zusammenhang.
-- Deshalb gibt es jetzt die Reihe: ein Thema, dazu nummerierte Schritte.
--
-- Einzelne Videos bleiben, wie sie sind. Wer ein Video ohne Reihe
-- hochlädt, merkt von dieser Änderung nichts.

begin;

create table if not exists tipp_reihe (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null,
  beschreibung text not null default '',
  schlagworte  text not null default '',
  erstellt_von text not null,
  erstellt_am  timestamptz not null default now()
);

-- Zu welcher Reihe ein Video gehört, und an welcher Stelle.
alter table tipp add column if not exists reihe_id uuid references tipp_reihe (id) on delete cascade;
alter table tipp add column if not exists schritt int not null default 1;

create index if not exists tipp_reihe_schritt on tipp (reihe_id, schritt);

commit;
