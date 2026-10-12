-- Rolle für Content Creator (Florian, 12.10.2026).
--
-- Er zeichnet Videos auf und schneidet sie zu Hause. Deshalb stempelt
-- er, und zwar auch von zu Hause: Die Geländegrenze, die für alle
-- anderen gilt, würde seine Arbeitszeit unmöglich machen. Wo gestempelt
-- wurde, steht am Stempel und ist im Büro zu sehen.
alter table benutzer drop constraint if exists benutzer_rolle_gueltig;
alter table benutzer add constraint benutzer_rolle_gueltig
  check (rolle in ('chef', 'team', 'gastro', 'foyer', 'showteam', 'kiosk', 'agentur',
                   'buchhaltung', 'reinigung', 'nebenjob', 'content'));
