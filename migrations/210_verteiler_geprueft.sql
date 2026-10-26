-- Welche Adresse im Verteiler haben wir uns schon angesehen?
-- (Florian, 25.10.2026)
--
-- "dann guckst du auch mal welche email adressen bei uns schrott sind ...
-- diese gehen wir einzeln durch zusammen und löschen sie aus unserem
-- verteiler raus."
--
-- Einzeln durchgehen heißt: Eine Adresse, die wir behalten wollen, darf
-- beim nächsten Mal nicht wieder oben auf der Liste stehen. Deshalb steht
-- hier, was entschieden wurde und von wem.
--
--   'behalten'   Sieht komisch aus, ist aber ein Mensch, den wir wollen.
--   'entfernt'   Aus den Magic News genommen.
begin;

create table if not exists verteiler_geprueft (
  email        text primary key,
  entscheidung text not null,
  grund        text not null default '',
  von          text not null default '',
  am           timestamptz not null default now()
);

commit;
