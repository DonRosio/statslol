-- Runs once, when the database is created (see compose.yaml).
-- Creates the role the API connects with. It is not the owner of the tables: the migrations
-- (apps/api/drizzle) only allow it to read and write their rows, never to change the schema.

-- psql reads the password from the environment and quotes it (:'...'), whatever it contains.
\getenv app_password POSTGRES_APP_PASSWORD
CREATE ROLE statslol_app LOGIN PASSWORD :'app_password';
