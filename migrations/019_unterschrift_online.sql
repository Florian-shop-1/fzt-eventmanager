-- Online unterschreiben.
--
-- Bisher gab es nur den Weg über Papier: drucken, unterschreiben,
-- abgeben, und der Inhaber hakt ab. Das bleibt, aber es geht jetzt auch
-- direkt am Bildschirm.
--
-- Damit eine solche Unterschrift etwas wert ist, reicht ein Häkchen
-- nicht. Festgehalten wird deshalb mehr als nur der Zeitpunkt:
--
--   das gezeichnete Namenszeichen als Bild,
--   wann unterschrieben wurde,
--   von welcher Adresse und mit welchem Gerät,
--   und welche Fassung des Vertragstextes dabei auf dem Schirm stand.
--
-- Der letzte Punkt ist der wichtigste und wird gern vergessen. Ohne ihn
-- lässt sich später nicht sagen, wozu jemand eigentlich unterschrieben
-- hat, wenn der Text zwischenzeitlich geändert wurde.

alter table geheimhaltung add column if not exists unterschrift_art text;
alter table geheimhaltung add column if not exists unterschrift_bild text;
alter table geheimhaltung add column if not exists unterschrift_ip text;
alter table geheimhaltung add column if not exists unterschrift_geraet text;
alter table geheimhaltung add column if not exists unterschrift_textstand text;

comment on column geheimhaltung.unterschrift_art is
  'papier = unterschriebenes Blatt liegt vor, online = am Bildschirm gezeichnet.';
comment on column geheimhaltung.unterschrift_bild is
  'Das gezeichnete Namenszeichen als PNG in Textform. Nur beim Online-Weg gesetzt.';
comment on column geheimhaltung.unterschrift_textstand is
  'Fingerabdruck des Vertragstextes zum Zeitpunkt der Unterschrift. Belegt, welche Fassung galt.';

-- Was bisher abgehakt wurde, war immer Papier.
update geheimhaltung set unterschrift_art = 'papier'
 where unterschrieben_am is not null and unterschrift_art is null;
