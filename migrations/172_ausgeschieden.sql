-- Warum jemand nicht mehr dabei ist (Florian, 12.10.2026).
--
-- Christian hat sich nach dem Schnuppern gegen die Stelle entschieden.
-- Ein gesperrter Zugang allein sagt das nicht: Ein Jahr später weiss
-- niemand mehr, ob jemand gekündigt hat, nie angefangen hat oder nur
-- versehentlich gesperrt wurde.
alter table benutzer add column if not exists ausgeschieden_am timestamptz;
alter table benutzer add column if not exists ausscheiden_grund text not null default '';

comment on column benutzer.ausscheiden_grund is
  'Warum der Zugang gesperrt wurde. Nur fuers Buero, steht nirgends sonst.';
