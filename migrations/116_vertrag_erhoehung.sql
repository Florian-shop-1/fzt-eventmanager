-- Verdient jemand mit dem neuen Vertrag mehr als vorher?
--
-- "wenn sich der stundenlohn erhöht, sollte der hase sich freuen"
-- (Florian, 01.10.2026). Dafür muss beim Anlegen festgehalten werden, ob
-- der neue Satz über dem alten liegt: Später lässt es sich nicht mehr
-- sauber sagen, weil der alte Vertrag dann zurückgezogen ist und
-- womöglich mehrere Vorgänger existieren.

alter table arbeitsvertrag add column if not exists erhoehung boolean not null default false;
