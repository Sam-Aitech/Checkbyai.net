// Load-evidence runner for Proof 3.
// Zero dependencies (Node 20 global fetch/FormData only).
//
// Usage:
//   node scripts/load/verify-load.mjs \
//     --base http://localhost:5000 \
//     --cookie "connect.sid=s%3A..." \
//     [--pdf ./sample.pdf] [--concurrency 8] [--duration 60] \
//     [--label baseline|under-load] [--out docs/perf-evidence]
//
// --cookie must belong to an admin user (reads /metrics/perf) with COS access
// (for POST /api/verify). Without --pdf only API traffic is generated.
// Prints a JSON summary and writes load-<label>-<timestamp>.json.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => {
    if (!a.startsWith("--")) return [];
    const eq = a.indexOf("=");
    if (eq > 0) return [[a.slice(2, eq), a.slice(eq + 1)]];
    return [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]];
  }),
);

const BASE = (args.base || "http://localhost:5000").replace(/\/$/, "");
const COOKIE = args.cookie || "";
const CONCURRENCY = parseInt(args.concurrency || "8", 10);
const DURATION_S = parseInt(args.duration || "60", 10);
const PDF_PATH = args.pdf || null;
const LABEL = args.label || "run";
const OUT_DIR = args.out || "docs/perf-evidence";

if (!COOKIE) {
  console.error("Missing --cookie (admin session cookie required for /metrics/perf).");
  process.exit(1);
}

const headers = { Cookie: COOKIE };
const latencies = [];
let apiErrors = 0;
let apiCount = 0;
let jobsAccepted = 0;
let jobsCompleted = 0;
let jobsFailed = 0;

async function timedGet(path) {
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    await res.arrayBuffer();
    if (!res.ok) apiErrors += 1;
  } catch {
    apiErrors += 1;
  } finally {
    latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
    apiCount += 1;
  }
}

const API_PATHS = [
  "/api/health",
  "/api/sponsors/directory?limit=5",
  "/api/sponsors/directory?limit=5&status=ACTIVE",
  "/api/sponsors/nightly-stats",
  "/api/sponsors/latest-change",
];

async function apiWorker(deadline) {
  let i = 0;
  while (Date.now() < deadline) {
    await timedGet(API_PATHS[i++ % API_PATHS.length]);
  }
}

async function submitPdf(pdfBytes) {
  const form = new FormData();
  form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "load-test.pdf");
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(`${BASE}/api/verify`, {
      method: "POST",
      headers,
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    const data = body.data ?? body;
    if (res.status === 202 && data?.statusUrl) {
      jobsAccepted += 1;
      await pollJob(data.statusUrl, 120000);
    } else if (res.ok) {
      jobsAccepted += 1;
      jobsCompleted += 1;
    } else {
      jobsFailed += 1;
    }
  } catch {
    jobsFailed += 1;
  } finally {
    latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
}

async function pollJob(statusUrl, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}${statusUrl}`, { headers });
      const body = await res.json().catch(() => ({}));
      const payload = body.data ?? body;
      if (payload.status === "completed") {
        jobsCompleted += 1;
        return;
      }
      if (payload.status === "failed" || payload.status === "evicted") {
        jobsFailed += 1;
        return;
      }
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  jobsFailed += 1;
}

async function pdfWorker(deadline, pdfBytes) {
  while (Date.now() < deadline) {
    await submitPdf(pdfBytes);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function perfSnapshot() {
  const res = await fetch(`${BASE}/metrics/perf`, { headers });
  if (!res.ok) throw new Error(`GET /metrics/perf -> ${res.status} (need ENABLE_ADMIN_METRICS_ROUTES=true + admin cookie)`);
  return res.json();
}

const pdfBytes = PDF_PATH ? readFileSync(PDF_PATH) : null;

await fetch(`${BASE}/metrics/perf/reset`, { method: "POST", headers });

const deadline = Date.now() + DURATION_S * 1000;
const workers = [];
for (let i = 0; i < CONCURRENCY; i++) workers.push(apiWorker(deadline));
if (pdfBytes) {
  for (let i = 0; i < 2; i++) workers.push(pdfWorker(deadline, pdfBytes));
}
await Promise.all(workers);

const sorted = [...latencies].sort((a, b) => a - b);
const serverPerf = await perfSnapshot().catch((e) => ({ error: e.message }));

const summary = {
  label: LABEL,
  timestamp: new Date().toISOString(),
  config: { base: BASE, concurrency: CONCURRENCY, durationS: DURATION_S, withPdf: Boolean(pdfBytes) },
  client: {
    requests: apiCount,
    errors: apiErrors,
    errorRate: apiCount === 0 ? 0 : apiErrors / apiCount,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  },
  jobs: { accepted: jobsAccepted, completed: jobsCompleted, failed: jobsFailed },
  server: serverPerf,
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, `load-${LABEL}-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${outPath}`);
