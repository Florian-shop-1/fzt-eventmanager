-- Doppelshow-Tage im Foyer teilen koennen (Florian, 23.10.2026).
--
-- Bisher gab es je Tag genau einen Dienst je Platz. An einem Samstag mit
-- Matinee und Abendshow stand deshalb eine Person von 13 bis 23 Uhr da,
-- mit einer Pause dazwischen, die nur als Hinweistext existierte. Eine
-- Mitarbeiterin hat es im Foyer angesprochen: Es waere ihnen lieber, sich
-- aufzuteilen, einer macht mittags, einer abends.
--
-- Der Abschnitt macht das moeglich, ohne etwas wegzunehmen:
--
--   ganz    der Tag am Stueck, so wie bisher. Voreinstellung, deshalb
--           aendert sich an bestehenden Eintraegen und an Tagen mit nur
--           einer Show gar nichts.
--   mittag  nur die Nachmittagsvorstellung
--   abend   nur die Abendvorstellung
--
-- Der Schluessel waechst entsprechend mit: Je Tag und Abschnitt gibt es
-- die Plaetze eins, zwei und so weiter.

begin;

alter table foyer_dienst
  add column if not exists abschnitt text not null default 'ganz';

alter table foyer_dienst
  drop constraint if exists foyer_dienst_abschnitt_check;
alter table foyer_dienst
  add constraint foyer_dienst_abschnitt_check
  check (abschnitt in ('ganz', 'mittag', 'abend'));

alter table foyer_dienst drop constraint if exists foyer_dienst_datum_nummer_key;
create unique index if not exists foyer_dienst_tag_abschnitt_platz
  on foyer_dienst (datum, abschnitt, nummer);

comment on column foyer_dienst.abschnitt is
  'ganz, mittag oder abend. An Tagen mit zwei Shows kann der Dienst geteilt '
  'werden, damit nicht eine Person zehn Stunden am Stueck steht.';

commit;
