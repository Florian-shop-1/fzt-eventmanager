-- Von Hand sortierte Angebote.
--
-- "kevin möchte gerne die einzelnen items in einem angebot per drag and
-- drop neu sortieren können" (Florian, 30.10.2026).
--
-- Das Programm sortiert sonst selbst: Tickets zuerst, dann
-- Exklusivbuchung, Menüs, Getränke und so weiter, innerhalb der Gruppe
-- fest vor optional. Sortiert ein Mensch von Hand, muss das gewinnen,
-- sonst würfelt das Programm beim nächsten Laden alles zurück.
--
-- Deshalb dieses Kennzeichen: Es steht am Angebot, nicht an der Zeile.
-- Entweder ordnet das Haus, oder Kevin ordnet. Beides zugleich gäbe
-- eine Reihenfolge, die niemand vorhersagen kann.

alter table angebot add column if not exists reihenfolge_manuell boolean not null default false;
