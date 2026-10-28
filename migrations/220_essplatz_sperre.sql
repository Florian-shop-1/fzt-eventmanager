-- Blockierte Plaetze am Tisch, getrennt nach Eventgalerie und Loge.
--
-- "du musst auch Plaetze auf eventgalerie oder loge blockieren koennen.
-- auch wenn nicht feststeht wieviele menues das sind" (Florian,
-- 28.10.2026).
--
-- Bisher liessen sich nur Showplaetze blockieren, und die liegen in
-- FloTix: Golden Seats, Kat. 1 bis 3, VIP-Empore. Wo jemand isst, weiss
-- FloTix gar nicht. Logen und Eventgalerie sind Plaetze am Tisch, und
-- die hat bisher niemand festgehalten. Eine Firma mit vierzig Leuten
-- konnte also einen Abend lang Showplaetze halten, waehrend die
-- Eventgalerie weiterverkauft wurde.
--
-- Die Sperre haelt beides auseinander: Anzahl und Bereich stehen hier,
-- die Showplaetze bleiben in FloTix. Je Vorgang und Bereich eine Zeile.

create table if not exists essplatz_sperre (
  id           uuid primary key default gen_random_uuid(),
  vorgang_id   uuid        not null references vorgang (id) on delete cascade,
  -- 'logen' oder 'eventgalerie', wie in domain/venue.ts
  bereich      text        not null,
  plaetze      int         not null check (plaetze > 0),
  bis          timestamptz not null,
  angelegt_von text        not null default '',
  angelegt_am  timestamptz not null default now(),
  unique (vorgang_id, bereich)
);

create index if not exists essplatz_sperre_bis_idx on essplatz_sperre (bis);
