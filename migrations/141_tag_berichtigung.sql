-- Den ganzen Tag berichtigen, nicht Stempel für Stempel.
--
-- Wer das Einstempeln vergisst, vergisst meistens auch das Ausstempeln
-- und die Pause. Bisher musste das Büro jeden Stempel einzeln ändern,
-- löschen oder nachtragen; bei drei Fehlern an einem Tag sind das sechs
-- Formulare. Florian am 09.10.2026: "wenn sie viele fehler auf einmal
-- machen, dann wäre das leichter einfach den ganzen tag zu sagen wie es
-- war und du vergleichst und nimmst dann die zeit von mir."
--
-- Dafür reicht ein weiterer Eintrag im Änderungsbuch, der den ganzen Tag
-- beschreibt statt eines einzelnen Stempels: was gestempelt war, was
-- eingetragen wurde, und wie viele Minuten das ausmacht. Die Differenz
-- ist der eigentliche Punkt, denn sie wandert in die Lohnabrechnung und
-- muss dort belegbar sein.
--
-- Die Spalten sind alle optional: Für die bisherigen Einträge
-- (geändert, gelöscht, nachgetragen) bleiben sie leer.

alter table stempel_aenderung add column if not exists alt_minuten int;
alter table stempel_aenderung add column if not exists neu_minuten int;
alter table stempel_aenderung add column if not exists alt_text text not null default '';
alter table stempel_aenderung add column if not exists neu_text text not null default '';
