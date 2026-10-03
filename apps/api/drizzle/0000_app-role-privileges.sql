-- The API connects as statslol_app (created by docker/postgres/initdb). The tables belong to the
-- role that runs the migrations: statslol_app may only read and write their rows. It cannot
-- create, alter or drop a table, so a flaw in the API cannot change the schema.
-- Default privileges apply to every table and sequence that the next migrations create.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO statslol_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO statslol_app;
