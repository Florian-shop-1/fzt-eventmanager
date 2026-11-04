-- Der Zuschauer sagt selbst Bescheid, dass er da ist.
--
-- "Ein zuschauer im Dienstplan zählt künftig alleine, aber er sollte
-- bestätigen, dass er da ist" (Florian, 04.11.2026).
--
-- Der Anlass: Roman stand von Ende September bis Ende Oktober einundzwanzig
-- Mal als Zuschauer im Plan und hat an zwanzig dieser Termine nicht
-- gestempelt. Gutgeschrieben waren ihm deshalb zwei Stunden statt rund
-- fünfzehn. Die Lohnauswertung rechnet nämlich ausschliesslich aus Stempeln;
-- der Zuschauer-Dienst wandelte bisher nur um, was gestempelt war, und ohne
-- Stempel blieb null.
--
-- Warum kein Stempel: Wer als Eingeweihter im Publikum sitzt, soll nicht am
-- Eingang mit dem Handy hantieren. Ein Klick von zu Hause oder vom Platz aus
-- genügt, und er ist zugleich die Bestätigung, dass er wirklich da war. Der
-- Dienstplan allein wäre das nicht, er sagt nur, wer eingeteilt ist.

alter table dienst_einsatz add column if not exists zuschauer_bestaetigt_am timestamptz;

-- Eine oder beide Haelften.
--
-- "als noch eine haelfte der show war = 1 Stunde zahlen, beide haelften
-- da = 2 Stunden bezahlen" (Florian, 04.11.2026). Gezahlt wird nicht nach
-- der Uhr, sondern pauschal: Eine Stunde allein lohnt den Weg nicht,
-- deshalb zwei, sobald er die ganze Show sitzt.
alter table dienst_einsatz add column if not exists zuschauer_haelften smallint;

create index if not exists dienst_einsatz_zuschauer
  on dienst_einsatz (datum)
  where position = 'ZUSCHAUER' and zuschauer_bestaetigt_am is not null;
