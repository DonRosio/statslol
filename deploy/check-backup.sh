#!/usr/bin/env bash
# Tries a backup of the database (made by statslol-backup on the server) on this computer:
# restores it into a throwaway PostgreSQL container, shows what it holds, then removes the
# container. The development database is not touched.
#   deploy/check-backup.sh statslol-2026-10-05T033512Z.dump
set -euo pipefail

if (($# != 1)) || [[ ! -r $1 ]]; then
  echo "usage: $0 <file.dump>" >&2
  exit 2
fi
dump=$1
# The image of PostgreSQL in production.
image=$(grep -m 1 -oE 'postgres:[0-9][^ ]*' "$(dirname "$0")/compose.yaml")
container=statslol-check-backup-$$

docker run --detach --name "$container" --env POSTGRES_PASSWORD=unused "$image" >/dev/null
trap 'docker rm --force "$container" >/dev/null' EXIT
# Over TCP: while it initializes, the server only listens on its Unix socket.
for _ in $(seq 60); do
  docker exec "$container" pg_isready --quiet --host=127.0.0.1 --username=postgres && break
  sleep 1
done

# The dump gives rights on the tables to the role of the API: it must exist.
docker exec "$container" psql --quiet --username=postgres --command='CREATE ROLE statslol_app'
docker exec --interactive "$container" \
  pg_restore --username=postgres --dbname=postgres --create --exit-on-error <"$dump"
docker exec "$container" psql --username=postgres --dbname=statslol \
  --command='SELECT count(*) AS matches, min(fetched_at) AS oldest, max(fetched_at) AS newest FROM matches' \
  --command='SELECT count(*) AS migrations FROM drizzle.__drizzle_migrations'
echo "$dump can be restored."
