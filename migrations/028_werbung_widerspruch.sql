-- Wer keine Vorfreude-Mail mehr bekommen möchte.
--
-- Die Mail eine Woche vor der Show geht an Gäste, die bei uns gekauft haben,
-- und bietet ihnen an, was zum selben Abend noch fehlt. Das ist nach § 7
-- Abs. 3 UWG erlaubt, aber an vier Bedingungen geknüpft. Drei davon erfüllt
-- der Ablauf von selbst: eigene ähnliche Ware, Adresse aus dem Verkauf,
-- Hinweis bei der Erhebung. Die vierte ist diese Tabelle. Ohne einen Weg,
-- jederzeit zu widersprechen, dürfen wir die Mail nicht schicken.
--
-- Der Schlüssel ist die Adresse, nicht die Buchung: Wer widerspricht, meint
-- sich, nicht diesen einen Abend. Deshalb wird kleingeschrieben gespeichert
-- und beim Prüfen ebenso kleingeschrieben verglichen.
--
-- Bewusst ohne Fremdschlüssel auf eine Buchung. Ein Widerspruch muss auch
-- dann bestehen bleiben, wenn die zugehörige Buchung irgendwann verschwindet.
-- Er ist das Einzige an diesen Daten, das niemals verfallen darf.

create table if not exists werbung_widerspruch (
  email          text        primary key,
  -- 'link' (Abmeldelink in der Mail), 'hand' (jemand hat angerufen oder
  -- geantwortet und es wurde eingetragen).
  quelle         text        not null default '',
  eingetragen_am timestamptz not null default now()
);
