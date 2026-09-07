-- Aktionscodes aus Ditix, im Eventmanager verwaltet und verschickt.
--
-- In Ditix liegen mehrere Vorräte nebeneinander: Freikarten für alle
-- Tickets, Freikarten nur für Kindertickets, VIP-Parkplatz kostenlos,
-- Souvenirglas kostenlos. Alle laufen bis weit in die 2030er.
--
-- Das Problem, das dahintersteckt: Neu angelegte Codes müssen in Ditix
-- bei jeder einzelnen Show freigeschaltet werden. Deshalb wurden die
-- Vorräte vorsorglich vor den Shows angelegt, in grosser Zahl.
--
-- Der Eventmanager verwaltet diese Vorräte, verschickt einen Code an den
-- Kunden und merkt sich, wer wann welchen bekommen hat und warum. Damit
-- geht kein Code zweimal hinaus, und am Jahresende lässt sich sagen,
-- wofür die Freikarten draufgegangen sind.
--
-- Was der Eventmanager NICHT weiss: ob ein Code eingelöst wurde. Das
-- steht nur in Ditix, und dafür gibt es bisher keinen Zugang. Hier steht
-- also "verschickt", nicht "eingelöst".

create table if not exists code_aktion (
  id           uuid primary key default gen_random_uuid(),
  -- So, wie die Aktion in Ditix heisst. Erleichtert das Wiederfinden.
  name         text not null,
  /* Was der Empfänger davon hat, in einem Satz. Steht in der Mail. */
  beschreibung text,
  gueltig_bis  text,
  aktiv        boolean not null default true,
  angelegt_am  timestamptz not null default now()
);

comment on table code_aktion is
  'Ein Vorrat gleichartiger Codes aus Ditix, etwa "Freikarten für alle Tickets".';

create table if not exists aktionscode (
  id           uuid primary key default gen_random_uuid(),
  aktion_id    uuid not null references code_aktion(id) on delete cascade,
  code         text not null,
  angelegt_am  timestamptz not null default now(),
  -- Vergabe: gesetzt, sobald der Code jemandem zugesagt ist.
  vergeben_am  timestamptz,
  vergeben_von text,
  empfaenger   text,
  empfaenger_email text,
  anlass       text,
  vorgang_id   uuid references vorgang(id) on delete set null
);

comment on column aktionscode.vergeben_am is
  'Gesetzt, sobald der Code reserviert ist. Wird beim Fehlschlag des Mailversands wieder geleert.';

-- Derselbe Code darf nur einmal im Vorrat stehen. Beim Einfügen einer
-- Liste ist doppeltes Einfuegen sonst leicht passiert.
create unique index if not exists aktionscode_eindeutig on aktionscode (aktion_id, code);

-- Der haeufigste Zugriff: den naechsten freien Code einer Aktion holen.
create index if not exists aktionscode_frei on aktionscode (aktion_id) where vergeben_am is null;
