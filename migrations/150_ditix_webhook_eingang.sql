-- Meldungen von Ditix mitschreiben (Julian, 06.10.2026).
--
-- Erster Schritt, bewusst klein: Ditix meldet jeden Verkauf an Make. Dieselbe
-- Meldung soll zusätzlich hier ankommen, unverändert abgelegt, damit wir
-- sehen, wie sie wirklich aussieht, bevor wir etwas daraus bauen: welche
-- Meldungsarten es gibt, ob eine Bestellung mehrfach gemeldet wird, ob
-- Ditix bei Fehlern wiederholt und welche Kopfzeilen es mitschickt.
--
-- Ausgewertet wird noch nichts. Diese Tabelle ist nur das Protokoll.

create table if not exists webhook_eingang (
  id            uuid        primary key default gen_random_uuid(),
  quelle        text        not null,
  -- message_id von Ditix. Über sie erkennen wir, dass dieselbe Meldung
  -- mehrfach kommt. Fehlt sie, gilt jede Meldung als neu.
  nachricht_id  text,
  event_type    text        not null default '',
  order_id      text        not null default '',
  empfangen_am  timestamptz not null default now(),
  -- Wie oft genau diese Meldung angekommen ist. Mehr als 1 heißt: Ditix
  -- wiederholt, oder der Absender sendet doppelt.
  empfangen_n   int         not null default 1,
  zuletzt_am    timestamptz not null default now(),
  -- Die Meldung, wie sie ankam. Ist der Rumpf kein gültiges JSON, steht hier
  -- {"_unlesbar": "<Anfang des Textes>"}, damit auch das sichtbar wird.
  roh           jsonb       not null,
  -- Kopfzeilen der Anfrage, ohne Schlüssel und Cookies.
  kopf          jsonb       not null default '{}'::jsonb
);

create unique index if not exists webhook_eingang_nachricht
  on webhook_eingang (quelle, nachricht_id);
create index if not exists webhook_eingang_zeit
  on webhook_eingang (quelle, empfangen_am desc);
create index if not exists webhook_eingang_order
  on webhook_eingang (quelle, order_id);
