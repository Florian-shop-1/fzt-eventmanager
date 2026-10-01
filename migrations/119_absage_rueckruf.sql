-- Rückruf statt Klicken (Florian, 01.10.2026).
--
-- Wenn eine Show ausfällt, passt manchen Gästen keiner der angebotenen
-- Termine, oder sie haben Fragen, die eine Liste nicht beantwortet. Die
-- rufen sonst irgendwann an, oder eben nicht. Deshalb kann der Gast auf
-- seiner Seite um einen Rückruf bitten; Florian und Kevin sehen das in
-- der Absage und bekommen eine Mail.

alter table absage_gast add column if not exists rueckruf_nummer text not null default '';
alter table absage_gast add column if not exists rueckruf_notiz text not null default '';
alter table absage_gast add column if not exists rueckruf_am timestamptz;
alter table absage_gast add column if not exists rueckruf_erledigt_von text;
alter table absage_gast add column if not exists rueckruf_erledigt_am timestamptz;
