-- Einladungslink fürs Showteam: Florian verschickt einen Link, jeder legt
-- sich damit selbst einen Zugang an (Rolle showteam, FZT-intern) und sagt,
-- welche Position er macht. Ein neuer Link schaltet den alten ab.
create table if not exists einladung (
  token        text primary key,
  rolle        text not null default 'showteam',
  aktiv        boolean not null default true,
  erstellt_von text,
  erstellt_am  timestamptz not null default now(),
  benutzt      int not null default 0
);
