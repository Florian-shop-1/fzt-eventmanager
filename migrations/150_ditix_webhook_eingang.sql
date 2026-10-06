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
  kopf          jsonb       not null default '{}'::jsonb,
  -- md5 des Inhalts. Zusammen mit message_id und Art erkennt es eine echte
  -- Wiederholung. Ditix verwendet bei order_created die Bestellnummer als
  -- message_id (beobachtet am 06.10.2026). Käme dieselbe ID bei einer Änderung
  -- oder einem Storno noch einmal, dürfte die neue Meldung nicht als
  -- Wiederholung verschluckt werden.
  inhalt_md5    text        not null default ''
);

create unique index if not exists webhook_eingang_dublette
  on webhook_eingang (quelle, event_type, nachricht_id, inhalt_md5);
create index if not exists webhook_eingang_zeit
  on webhook_eingang (quelle, empfangen_am desc);
create index if not exists webhook_eingang_order
  on webhook_eingang (quelle, order_id);
