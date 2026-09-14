-- WhatsApp im Eventmanager.
--
-- Die Nummer aus der WhatsApp Business App (0731 7906110) bleibt in der App
-- und wird zusätzlich über 360dialog an die WhatsApp-Schnittstelle von Meta
-- angebunden ("Coexistence"). Jede Nachricht kommt dann doppelt an: wie
-- bisher in der App, und über einen Webhook hier.
--
-- Hier liegt der Verlauf, damit das Büro ihn gemeinsam sieht und aus dem
-- Eventmanager heraus antworten kann. Was jemand direkt in der App schreibt,
-- meldet WhatsApp ebenfalls hierher ("Echo"), damit der Verlauf vollständig
-- bleibt, egal wo geantwortet wurde.

-- Wer den Posteingang sieht.
--
-- Bewusst eine Freigabe pro Person und nicht pro Rolle: Gemeint sind Florian,
-- Kevin und Sarah. Sarah arbeitet mit der Rolle Foyer, Jessica und Julian mit
-- der Rolle Team. Eine Rollenregel hätte also entweder Sarah ausgesperrt oder
-- allen Kundenchats vor die Nase gelegt, die sie nichts angehen.
alter table benutzer add column if not exists whatsapp boolean not null default false;

comment on column benutzer.whatsapp is
  'Sieht den WhatsApp-Posteingang und bekommt neue Nachrichten angezeigt.';

-- Eine Unterhaltung je Kunde. Schlüssel ist die WhatsApp-Kennung, das ist
-- die Telefonnummer ohne Plus, etwa 4917612345678.
create table if not exists wa_unterhaltung (
  wa_id               text primary key,
  -- Der Name, den der Kunde in WhatsApp für sich eingetragen hat. Kann
  -- sich ändern und muss nicht stimmen.
  profilname          text,
  letzte_nachricht_am timestamptz,
  -- Von hier aus zählt das 24-Stunden-Fenster: So lange darf frei
  -- geantwortet werden, danach nur mit einer von Meta genehmigten Vorlage.
  letzte_eingang_am   timestamptz,
  -- Gemeinsamer Lesestand für alle. Hat einer die Nachricht geöffnet, ist
  -- sie für die anderen auch nicht mehr neu. So antworten nicht zwei
  -- Leute gleichzeitig auf dieselbe Frage.
  gelesen_am          timestamptz,
  gelesen_von         text,
  angelegt_am         timestamptz not null default now()
);

create table if not exists wa_nachricht (
  id           uuid primary key default gen_random_uuid(),
  -- Die Kennung von WhatsApp. Eindeutig, weil 360dialog einen Webhook bei
  -- einem Fehler wiederholt und dieselbe Nachricht sonst doppelt dastünde.
  meta_id      text unique,
  wa_id        text not null references wa_unterhaltung(wa_id) on delete cascade,
  richtung     text not null check (richtung in ('ein', 'aus')),
  -- kunde: vom Kunden. eventmanager: hier geschrieben. app: in der
  -- WhatsApp Business App geschrieben und als Echo gemeldet.
  herkunft     text not null check (herkunft in ('kunde', 'eventmanager', 'app')),
  typ          text not null default 'text',
  text         text,
  zeitpunkt    timestamptz not null,
  -- Zustellung ausgehender Nachrichten: sent, delivered, read, failed.
  status       text,
  fehler       text,
  gesendet_von text,
  -- Die Nachricht, wie sie ankam. Für Bilder, Sprachnachrichten und
  -- Standorte, die der Posteingang heute nur als Hinweis zeigt.
  roh          jsonb,
  angelegt_am  timestamptz not null default now()
);

create index if not exists wa_nachricht_verlauf on wa_nachricht (wa_id, zeitpunkt);
create index if not exists wa_unterhaltung_neueste on wa_unterhaltung (letzte_nachricht_am desc);
