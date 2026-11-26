-- CHOSEN keeps all of its objects in the chosen schema.
--
-- Flyway's default schema is chosen, and Flyway creates it before running this script so it
-- has somewhere to keep its history table. IF NOT EXISTS makes this script say what it owns
-- without failing on that.
BEGIN;

CREATE SCHEMA IF NOT EXISTS chosen;

COMMIT;
