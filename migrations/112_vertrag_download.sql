-- Wann hat jemand seinen Arbeitsvertrag heruntergeladen?
--
-- Der Vertrag sagt zu, dass der Arbeitnehmer eine unterzeichnete
-- Ausfertigung bekommt. Bei einer Unterschrift am Bildschirm ist der
-- Download genau das, deshalb wird er festgehalten (Florian, 30.09.2026:
-- "dokumentiere, wann runtergeladen wurde").
--
-- Festgehalten wird jeder Abruf, nicht nur der erste: Wer den Vertrag
-- zweimal holt, hat ihn vielleicht beim ersten Mal nicht bekommen.

create table if not exists vertrag_download (
  id uuid primary key default gen_random_uuid(),
  vertrag_id uuid not null references arbeitsvertrag(id) on delete cascade,
  -- Wer geladen hat: der Arbeitnehmer selbst oder jemand aus dem Büro.
  wer text not null default '',
  eigener boolean not null default false,
  ip text not null default '',
  geraet text not null default '',
  wann timestamptz not null default now()
);

create index if not exists vertrag_download_vertrag on vertrag_download (vertrag_id, wann desc);
