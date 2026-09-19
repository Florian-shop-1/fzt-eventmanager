-- Persönliche Einladung: für eine bestimmte Person und Rolle (etwa Foyer),
-- mit fester E-Mail, nur einmal gültig. Was schon erledigt ist (Personalbogen,
-- Geheimhaltung auf Papier), wird beim Eintragen gleich abgehakt.
alter table einladung add column if not exists email text;
alter table einladung add column if not exists art text check (art in ('intern', 'extern'));
alter table einladung add column if not exists personalbogen_erledigt boolean not null default false;
alter table einladung add column if not exists geheimhaltung_erledigt boolean not null default false;
