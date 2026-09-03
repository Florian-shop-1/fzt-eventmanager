-- Grußworte auf dem Gutschein, nachträglich änderbar.
--
-- Der Käufer gibt im Shop ein, für wen der Gutschein ist, was drauf stehen
-- soll und von wem er kommt. Das steht so in der Versandtabelle und gehört
-- auf den Gutschein.
--
-- Manchmal muss man daran aber noch etwas richten: ein Tippfehler, eine
-- fehlende Anrede, ein Satz ohne Punkt. Bisher ging das nur in der
-- Google-Tabelle oder gar nicht. Deshalb kann der Text hier überschrieben
-- werden. Steht hier nichts, gilt der Wert aus der Tabelle.

alter table versand_stand add column if not exists widmung_fuer text;
alter table versand_stand add column if not exists widmung_text text;
alter table versand_stand add column if not exists widmung_von text;
alter table versand_stand add column if not exists gueltig_bis text;

comment on column versand_stand.widmung_fuer is
  'Überschreibt den Empfänger auf dem Gutschein ("Für ..."). Leer heißt: Wert aus der Versandtabelle.';
comment on column versand_stand.widmung_text is
  'Überschreibt die Widmung. Leer heißt: Wert aus der Versandtabelle.';
comment on column versand_stand.widmung_von is
  'Überschreibt den Absender ("Von ..."). Leer heißt: Wert aus der Versandtabelle.';
comment on column versand_stand.gueltig_bis is
  'Gültigkeit auf dem Gutschein. Leer heißt "Unbegrenzt", so wie in den bisherigen Dokumenten.';
