-- Was der Hase sagt, wenn der Vertrag bereitliegt.
--
-- Florian will den Satz selbst schreiben können: "Botschaft vom Hasi
-- individualisieren" (01.10.2026). Bleibt das Feld leer, sagt der Hase
-- den Standardsatz, und bei einer Gehaltserhöhung freut er sich von
-- selbst.

alter table arbeitsvertrag add column if not exists hase_text text not null default '';
