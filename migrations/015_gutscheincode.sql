-- Der Gutscheincode aus Ditix.
--
-- Ditix gibt den Code nicht über die Schnittstelle heraus. Er steht nur in
-- der Bestellung im Ditix-Backend, und jemand muss ihn von Hand
-- herüberholen. Das ist lästig, lässt sich aber nicht wegprogrammieren.
--
-- Was das Programm tun kann: den Weg so kurz wie möglich machen. Ein Klick
-- öffnet die Bestellung, ein Feld nimmt den Code auf, und danach steht er
-- auf dem gedruckten Gutschein. Zweimal muss ihn niemand abtippen.

alter table versand_stand add column if not exists gutscheincode text;
alter table versand_stand add column if not exists betrag_cent integer;

comment on column versand_stand.gutscheincode is
  'Aus dem Ditix-Backend übernommener Gutscheincode. Von Hand eingetragen, weil Ditix ihn nicht über die Schnittstelle liefert.';
comment on column versand_stand.betrag_cent is
  'Abweichender Betrag, falls der aus der Tabelle nicht stimmt. Leer heißt: Wert aus der Versandtabelle.';
