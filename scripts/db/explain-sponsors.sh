#!/bin/sh
# DB proof harness for migration 0024 (Proof 4).
# Captures EXPLAIN (ANALYZE, BUFFERS) for the real sponsor query shapes
# BEFORE (0024 indexes dropped) and AFTER (0024 applied).
#
# Requires: psql in PATH, DATABASE_URL set, ~100k rows in sponsor_canonical
# (production-like volume; a 500-row dev DB will seq-scan regardless).
# Safe to run on staging. Do NOT run the DROP section on production.
#
# Usage: DATABASE_URL=postgres://... sh scripts/db/explain-sponsors.sh
set -eu

OUT="docs/perf-evidence/explain"
BEFORE="$OUT/before"
AFTER="$OUT/after"
mkdir -p "$BEFORE" "$AFTER"

: "${DATABASE_URL:?DATABASE_URL must be set}"

q1="SELECT id, fingerprint, current_name, town_city, county, type_rating, route, status
FROM sponsor_canonical
WHERE status = 'ACTIVE' AND route ILIKE '%Skilled Worker%'
ORDER BY CASE status WHEN 'NEWLY_GRANTED' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'GRACE_PERIOD' THEN 2 ELSE 3 END, current_name ASC
LIMIT 50;"

q2="SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
COUNT(*) FILTER (WHERE status = 'NEWLY_GRANTED') AS newly_granted,
COUNT(*) FILTER (WHERE status = 'REMOVED_REVOKED' AND removed_at >= NOW() - INTERVAL '7 days') AS removed_this_week,
COUNT(*) FILTER (WHERE status = 'GRACE_PERIOD') AS grace_period
FROM sponsor_canonical;"

q3="SELECT id, fingerprint, current_name, town_city, type_rating, route, status,
GREATEST(similarity(current_name, 'Acme Global'), 0) AS match_score
FROM sponsor_canonical
WHERE (current_name % 'Acme Global') AND status IN ('ACTIVE', 'NEWLY_GRANTED')
ORDER BY match_score DESC LIMIT 20;"

q4="SELECT id, fingerprint, current_name, town_city, type_rating, route, status
FROM sponsor_canonical
WHERE status = 'REMOVED_REVOKED' AND (current_name % 'Acme Global')
ORDER BY similarity(current_name, 'Acme Global') DESC LIMIT 10;"

run_all() {
  dir="$1"
  i=1
  for q in "$q1" "$q2" "$q3" "$q4"; do
    # shellcheck disable=SC2086
    psql "$DATABASE_URL" -X -q -c "EXPLAIN (ANALYZE, BUFFERS) $q" > "$dir/q$i.txt" 2>&1
    i=$((i + 1))
  done
  psql "$DATABASE_URL" -X -q -c "SELECT indexname FROM pg_indexes WHERE tablename = 'sponsor_canonical' AND indexname LIKE 'idx_sponsor_canonical%' ORDER BY 1;" > "$dir/indexes.txt" 2>&1
}

echo "--- BEFORE: dropping 0024 indexes (staging only) ---"
psql "$DATABASE_URL" -X -q -c "DROP INDEX CONCURRENTLY IF EXISTS idx_sponsor_canonical_trgm_route;" 2>&1 || true
psql "$DATABASE_URL" -X -q -c "DROP INDEX CONCURRENTLY IF EXISTS idx_sponsor_canonical_removed_at;" 2>&1 || true
run_all "$BEFORE"

echo "--- AFTER: applying migrations/0024 ---"
psql "$DATABASE_URL" -X -q -f migrations/0024_sponsor_directory_route_trgm.sql
run_all "$AFTER"

echo "--- index usage diff ---"
grep -h -o "idx_sponsor_canonical_[a-z_]*" "$AFTER"/*.txt | sort | uniq -c | sort -rn || true
echo "Outputs in $BEFORE and $AFTER"
