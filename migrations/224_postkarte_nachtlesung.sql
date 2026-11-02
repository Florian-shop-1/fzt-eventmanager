-- Postkarten werden nachts gelesen, nicht beim Scannen.
--
-- "bitte mach das so, dass du dir die fotos speicherst und dann den
-- antrophic scanner wie bei den emojis einfach über nacht nutzt, weil
-- es günstiger ist" (Florian, 02.11.2026).
--
-- Im Batch kostet dieselbe Lesung die Hälfte, und gebraucht werden die
-- Ergebnisse erst am nächsten Tag: Entschieden wird ohnehin im Büro,
-- nicht im Foyer zwischen zwei Gästen.
--
-- Der Stand "wartet" ist neu und steht vor "gelesen". Bild da, Text
-- noch nicht.

alter table postkarte add column if not exists batch_id text;

-- Dasselbe Foto zweimal hochgeladen faellt jetzt schon vor dem Lesen
-- auf. Der Abgleich ueber den Text (fingerabdruck) kann das nicht mehr
-- leisten, weil es den Text beim Hochladen noch nicht gibt.
alter table postkarte add column if not exists bild_md5 text;

create index if not exists postkarte_batch_idx on postkarte (batch_id);
create index if not exists postkarte_md5_idx on postkarte (bild_md5);
create index if not exists postkarte_status_idx on postkarte (status);
