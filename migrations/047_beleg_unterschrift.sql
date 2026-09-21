-- Digitale Unterschrift der bewirtenden Person auf dem Bewirtungsbeleg
-- (Florian, 19.09.2026). Gezeichnet in der App, als PNG gespeichert, und
-- wie alles andere nach dem Festschreiben unveränderbar (siehe Trigger).
alter table bewirtung add column if not exists unterschrift text;
alter table bewirtung add column if not exists unterschrieben_am timestamptz;
