-- Synthetic staging seed for Proof 4 (EXPLAIN) and Proof 3 (load) volume.
--
-- Generates production-like sponsor_canonical rows WITHOUT copying personal
-- or sensitive data. Distributions mirror production: status mix, town/route
-- cardinality, 7-day removed_at spread for the directory-stats query.
--
-- STAGING ONLY. Never run against production (fingerprints are synthetic but
-- would pollute the register and trigger notifications).
-- Usage: psql "$DATABASE_URL" -v seed_confirm=yes -v rowcount=100000 \
--          -f scripts/db/seed-synthetic-sponsors.sql
--
-- Idempotent: deletes prior synthetic rows (fingerprint LIKE 'synth-%') first.
-- Deterministic: setseed() makes the dataset repeatable across runs.

\if :{?seed_confirm}
\else
\echo 'Refusing: re-run with -v seed_confirm=yes (staging only)'
\q 1
\endif

SELECT setseed(0.42);

DELETE FROM sponsor_canonical WHERE fingerprint LIKE 'synth-%';

WITH params AS (
  SELECT (:'rowcount')::int AS n
),
names AS (
  SELECT
    g,
    (ARRAY['Acme','Beacon','Crest','Delta','Elm','Forge','Granite','Harbour','Ivy','Juniper','Kestrel','Lark','Meadow','North','Oak','Pioneer','Quartz','Ridge','Summit','Thames','Union','Vale','Willow','York']
      [1 + floor(random() * 24)] || ' ' ||
     ARRAY['Global','Care','Logistics','Foods','Tech','Health','Build','Retail','Legal','Travel','Media','Energy']
      [1 + floor(random() * 12)] || ' ' ||
     ARRAY['Ltd','Limited','PLC','Group','Partners','Services']
      [1 + floor(random() * 6)]) AS org,
    (ARRAY['London','Birmingham','Manchester','Leeds','Glasgow','Liverpool','Bristol','Sheffield','Edinburgh','Cardiff','Belfast','Leicester','Nottingham','Coventry','Hull']
      [1 + floor(random() * 15)]) AS town,
    (ARRAY['Skilled Worker','Senior or Specialist Worker','Student','Temporary Worker','Health and Care Worker']
      [1 + floor(random() * 5)]) AS route,
    (ARRAY['A (Premium)','A (SME+)','A (Small Sponsor)','B-rated']
      [1 + floor(random() * 4)]) AS rating,
    CASE
      WHEN random() < 0.85 THEN 'ACTIVE'
      WHEN random() < 0.90 THEN 'NEWLY_GRANTED'
      WHEN random() < 0.95 THEN 'GRACE_PERIOD'
      ELSE 'REMOVED_REVOKED'
    END AS status,
    CURRENT_DATE - floor(random() * 900)::int AS seen,
    CASE WHEN random() < 0.10 THEN ARRAY['Old ' || md5(g::text)] ELSE '{}' END AS hist
  FROM generate_series(1, (SELECT n FROM params)) AS g
)
INSERT INTO sponsor_canonical
  (fingerprint, current_name, town_city, county, type_rating, route,
   status, first_seen, last_seen, granted_at, removed_at,
   consecutive_misses, historical_names)
SELECT
  'synth-' || md5(g::text),
  org,
  town,
  NULL,
  rating,
  route,
  status,
  seen,
  seen,
  seen,
  CASE
    WHEN status = 'REMOVED_REVOKED' THEN NOW() - (floor(random() * 10) || ' days')::interval
    ELSE NULL
  END,
  CASE WHEN status = 'GRACE_PERIOD' THEN 1 WHEN status = 'REMOVED_REVOKED' THEN 3 ELSE 0 END,
  hist::text[]
FROM names;

SELECT status, COUNT(*) FROM sponsor_canonical WHERE fingerprint LIKE 'synth-%' GROUP BY status ORDER BY 1;
