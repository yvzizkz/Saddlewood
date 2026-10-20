#!/usr/bin/env bash
# Builds this worktree's LOCAL database from scratch: supabase/schema.sql, then
# every supabase/migrations file in order, then the synthetic seed.
#
# Local only. It talks to the Docker container of this worktree's own stack
# (supabase/config.toml project_id) and refuses anything else. Production
# migrations are applied by the supervisor after review, never from here.
#
#   supabase start -x vector,logflare,edge-runtime,realtime
#   scripts/local-db.sh            # schema + migrations + seed
#   scripts/local-db.sh --reset    # drop and rebuild the public schema first
set -euo pipefail
cd "$(dirname "$0")/.."

project=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)
container="supabase_db_${project}"
[[ "$project" == "saddlewood-cohesive" ]] || { echo "refusing: unexpected project_id '$project'" >&2; exit 1; }
docker inspect "$container" >/dev/null 2>&1 || { echo "start the stack first: supabase start" >&2; exit 1; }

run() { docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

if [[ "${1:-}" == "--reset" ]]; then
  run -c "drop schema if exists public cascade; create schema public; grant usage on schema public to postgres, anon, authenticated, service_role; grant all on schema public to postgres, service_role;"
fi

echo "schema.sql"
run < supabase/schema.sql
for f in supabase/migrations/*.sql; do
  echo "$(basename "$f")"
  run < "$f"
done
for f in supabase/seed*.sql; do
  [[ -f "$f" ]] || continue
  echo "seed: $(basename "$f")"
  run < "$f"
done
echo "done: $container"
