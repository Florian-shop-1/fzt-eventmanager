-- Zu welcher Show gehört ein Parkplatz, den wir selbst vergeben?
--
-- "man kann nicht erkennen ob jemand einen vip parkplatz für die mittags
-- oder abendshow hat" (Foyer über Florian, 24.10.2026). Bei einer Buchung
-- aus dem Shop steht die Uhrzeit an der Vorstellung. Bei einem Eintrag von
-- Hand stand bisher nur der Tag, und an einem Samstag mit zwei Shows ist
-- das genau die Lücke, über die sich das Foyer beschwert hat.
--
-- Dazu das Menü: Wer mittags isst, bleibt im Haus, und sein Platz bleibt
-- den ganzen Tag belegt. Ohne Menü wird er gegen halb sechs frei. Null
-- heißt weiterhin: hat niemand gesagt.
begin;

alter table parkplatz_hand
  add column if not exists uhrzeit text not null default '',
  add column if not exists menue   boolean;

commit;
