-- Arbeitsverträge: anlegen, online unterschreiben, nachlesen.
--
-- Das Büro legt den Vertrag an, der Mitarbeiter unterschreibt ihn am
-- Bildschirm. Gespeichert wird nicht nur, wer wann unterschrieben hat,
-- sondern auch der Text, den er dabei gesehen hat: Ein Vertrag, dessen
-- Wortlaut sich nachträglich ändern kann, ist keiner (Florian, 30.09.2026).

create table if not exists arbeitsvertrag (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references benutzer(id) on delete cascade,

  -- 'kurzfristig' oder 'teilzeit'
  art text not null,

  -- Was im Vertrag als Tätigkeit und Aufgaben steht.
  taetigkeit text not null default '',
  aufgaben text not null default '',
  -- Die Stelle im Haus: Foyer, Showteam, Technik, Büro.
  position text not null default '',

  beginn date not null,
  ende date not null,

  -- Kurzfristige Beschäftigung: Stundenlohn.
  stundenlohn_cent integer,
  -- Teilzeit: Stunden und Festgehalt.
  monatsstunden numeric(6, 2),
  wochenstunden numeric(6, 2),
  festgehalt_cent integer,
  probezeit_monate integer,

  -- Die Personalien, wie sie beim Anlegen galten. Ein späterer Umzug
  -- ändert den unterschriebenen Vertrag nicht.
  personalien jsonb not null default '{}'::jsonb,

  angelegt_von text not null default '',
  angelegt_am timestamptz not null default now(),

  -- Der Wortlaut, den der Mitarbeiter beim Unterschreiben gesehen hat,
  -- und sein Fingerabdruck.
  vertragstext text,
  textstand text,

  unterschrift text,
  unterschrieben_am timestamptz,
  unterschrift_ip text,
  unterschrift_geraet text,

  -- Zurückgezogen, falls sich jemand vertan hat. Ein unterschriebener
  -- Vertrag wird nicht gelöscht, sondern als zurückgezogen vermerkt.
  zurueckgezogen_am timestamptz,
  zurueckgezogen_von text
);

-- Je Mitarbeiter höchstens ein gültiger Vertrag. Zurückgezogene zählen
-- nicht mit, sonst liesse sich nach einem Versehen keiner mehr anlegen.
create unique index if not exists arbeitsvertrag_einer_je_person
  on arbeitsvertrag (benutzer_id)
  where zurueckgezogen_am is null;

create index if not exists arbeitsvertrag_offen
  on arbeitsvertrag (unterschrieben_am)
  where zurueckgezogen_am is null;
