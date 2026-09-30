-- Der Vertrag wird erst gezeigt, wenn das Büro ihn freigegeben hat.
--
-- Florian will ihn vorher sehen: "dass ich den vorher auch nochmal sehe,
-- bevor er ihm angeboten wird zur unterschrift" (30.09.2026). Solange
-- kein Datum hier steht, ist der Vertrag ein Entwurf, den nur das Büro
-- sieht. Der Mitarbeiter erfährt nichts davon.

alter table arbeitsvertrag add column if not exists freigegeben_am timestamptz;
alter table arbeitsvertrag add column if not exists freigegeben_von text not null default '';
