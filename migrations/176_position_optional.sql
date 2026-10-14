-- Optionale Positionen im Angebot (Florian, 14.10.2026).
--
-- "wie bei lexoffice soll das im Angebot aufgeführt sein mit optional
-- markiert, der Preis davon in Klammern, unten beim Gesamtpreis nicht
-- mitberücksichtigt werden."
--
-- Anders als eine Alternativposition ist eine optionale Position kein
-- Entweder-oder, sondern ein Angebot obendrauf: Der Kunde kann sie
-- dazunehmen, muss aber nicht.
alter table position add column if not exists optional boolean not null default false;
