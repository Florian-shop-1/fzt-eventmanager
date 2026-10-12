-- Handynummer und Einwilligung je Mitarbeiter (Florian, 12.10.2026).
--
-- Für die Dienstnachricht per WhatsApp brauchen wir zweierlei: die
-- Nummer und ein Ja dazu. Beides stand bisher nirgends.
--
-- whatsapp_ok ist absichtlich dreiwertig: null heisst "noch nicht
-- gefragt", true ja, false nein. Wer nein sagt, soll nicht jede Woche
-- wieder gefragt werden.
alter table benutzer add column if not exists handy text not null default '';
alter table benutzer add column if not exists whatsapp_ok boolean;
alter table benutzer add column if not exists whatsapp_ok_am timestamptz;

comment on column benutzer.handy is
  'Handynummer in Ziffern mit Laendervorwahl, etwa 491761234567. Leer heisst: keine da.';
comment on column benutzer.whatsapp_ok is
  'Einwilligung in Dienstnachrichten per WhatsApp. null = noch nicht gefragt.';
