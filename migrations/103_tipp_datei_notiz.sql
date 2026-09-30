-- Tipps & Tricks: nicht nur Videos (Florian, 30.09.2026).
--
-- Zu einer Anleitung gehört oft mehr als bewegte Bilder: das Datenblatt
-- als PDF, eine Liste zum Abschreiben, ein Text, den jemand irgendwo
-- herauskopiert hat.
--
-- Deshalb bekommt ein Eintrag zwei zusätzliche Möglichkeiten: eine Datei
-- statt eines Videos, oder gar keine Datei und nur einen Text. Die
-- Videospalten bleiben, wie sie sind, damit nichts umgeschrieben werden
-- muss.

begin;

-- Welche Sorte Eintrag: video, datei oder notiz.
alter table tipp add column if not exists art text not null default 'video'
  check (art in ('video', 'datei', 'notiz'));

-- Der Text einer Notiz, oder eine Ergänzung zu Video und Datei.
alter table tipp add column if not exists notiz text not null default '';

-- Der Dateiname, damit man sieht, was einen erwartet, bevor man klickt.
alter table tipp add column if not exists datei_name text not null default '';

-- Eine Notiz hat keine Datei. Bisher war video_url Pflicht.
alter table tipp alter column video_url drop not null;
alter table tipp alter column video_url set default '';
alter table tipp alter column video_typ set default '';

commit;
