-- Bilder und Sprachnachrichten aus WhatsApp sichtbar machen.
--
-- Bisher stand im Posteingang nur "[Bild]". Das Bild selbst lag bei
-- Meta und war von hier aus nicht zu sehen (Florian, 22.10.2026:
-- "sendet der Gast ein Foto auf WhatsApp an den Eventmanager sehen wir
-- das nicht").
--
-- Die Kennung des Bildes steht laengst in der Rohmeldung. Was fehlt,
-- ist ein Ort fuer die eigene Kopie: Meta loescht seine Dateien nach
-- 30 Tagen, der Posteingang ist aber auch ein Nachweis. Beim ersten
-- Ansehen wird die Datei deshalb einmal geholt und bleibt dann bei uns.

alter table wa_nachricht add column if not exists medien_url text;
alter table wa_nachricht add column if not exists medien_art text;

comment on column wa_nachricht.medien_url is
  'Unsere eigene Kopie des Bildes, der Sprachnachricht oder der Datei. '
  'Wird beim ersten Ansehen angelegt, danach wird Meta nicht mehr gefragt.';
comment on column wa_nachricht.medien_art is
  'Was es ist, als MIME-Art, etwa image/jpeg. Bestimmt, wie es angezeigt wird.';
