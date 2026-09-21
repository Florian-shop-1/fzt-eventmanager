-- Störungen, die das Programm selbst bemerkt, ohne dass ein Gast sie meldet.
--
-- Anlass (21.09.2026): Bei ULMFASSBAR, Flo-Zirkus und Magic Memories zeigte der
-- Shop eine Warteliste, obwohl diese Shows bis zum Beginn im Verkauf sind. In
-- Ditix stand bei einzelnen Terminen kein Preis auf den Saalplan-Kategorien,
-- also fand der Shop nichts zu verkaufen und bot die Warteliste an. Gemerkt hat
-- das niemand, bis Florian es zufällig selbst probierte.
--
-- Deshalb meldet der Shop jetzt selbst, wenn ein Gast bei diesen Shows nicht
-- buchen kann. Die Meldung landet hier, erscheint unter /stoerungen und geht
-- beim ersten Mal sofort als Mail an Florian, Kevin und Julian.
--
-- Gebündelt wird über `kennung`: Klicken zwanzig Gäste denselben Termin an,
-- steht hier eine Zeile mit anzahl = 20 und nicht zwanzig Zeilen, und es geht
-- genau eine Mail hinaus. Erst wenn die Störung abgehakt ist, beginnt für
-- denselben Termin eine neue Zeile.

create table if not exists technik_stoerung (
  id           bigserial primary key,
  -- Art der Störung, bisher nur 'warteliste'. Weitere kommen dazu.
  art          text        not null,
  -- Bündelung: Art und betroffener Termin, vom Shop gebildet.
  kennung      text        not null,
  show_name    text,
  event_id     text,
  -- Termin als Text, so wie der Gast ihn im Shop gesehen hat.
  event_zeit   text,
  -- Was der Shop festgestellt hat, etwa "all-categories-unpriced".
  grund        text,
  quelle       text,
  anzahl       int         not null default 1,
  erstmals_am  timestamptz not null default now(),
  zuletzt_am   timestamptz not null default now(),
  -- Wann die Warnmail hinausging. Nur eine je offener Störung.
  mail_am      timestamptz,
  erledigt_am  timestamptz,
  erledigt_von text,
  notiz        text
);

-- Je Kennung höchstens eine offene Zeile. Abgehakte bleiben als Verlauf stehen.
create unique index if not exists technik_stoerung_offen
  on technik_stoerung (kennung) where erledigt_am is null;

create index if not exists technik_stoerung_zeit on technik_stoerung (zuletzt_am desc);
