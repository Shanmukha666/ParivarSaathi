#!/usr/bin/env bash
# Build a throwaway database from the Supabase stub + every migration (in order, stopping on the first
# error), then run the RLS red-team suite. Needs only a reachable Postgres and psql.
#
#   Local (Postgres already running):  PGHOST=localhost PGPORT=5432 PGUSER=postgres bash tools/verify_rls.sh
#   CI: the workflow starts a postgres service and sets the same variables.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}" PGDATABASE="${PGDATABASE:-t}"
ADMIN_DB=postgres
psql -X -q -d "$ADMIN_DB" -c "drop database if exists $PGDATABASE" -c "create database $PGDATABASE" 2>&1 | grep -v NOTICE || true
RUN="psql -X -q -v ON_ERROR_STOP=1 -d $PGDATABASE"
$RUN -f supabase/tests/fixtures/supabase_stub.sql 2>&1 | grep -v -E "NOTICE|WARNING|HINT" || true
for f in supabase/migrations/*.sql; do
  if ! out=$($RUN -f "$f" 2>&1); then echo "MIGRATION FAILED: $f"; echo "$out" | grep -E "ERROR|FATAL" | head -3; exit 1; fi
  echo "ok   $f"
done
python3 supabase/tests/rls_test.py
