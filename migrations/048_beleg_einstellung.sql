-- Unterschrift einmal hinterlegen statt bei jedem Beleg neu zeichnen
-- (Florian, 21.09.2026). Sie wird beim Festschreiben automatisch auf den
-- Bewirtungsbeleg gesetzt. Wer will, zeichnet bei einem Beleg trotzdem
-- eine eigene. Ohne hinterlegte Unterschrift bleibt die digitale Freigabe:
-- wer den Beleg erfasst und festgeschrieben hat, steht ohnehin darauf.
create table if not exists beleg_einstellung (
  id                int primary key default 1 check (id = 1),
  unterschrift      text,
  unterschrift_von  text,
  unterschrift_am   timestamptz
);
insert into beleg_einstellung (id) values (1) on conflict (id) do nothing;
