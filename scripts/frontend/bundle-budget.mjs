// Bundle-budget guard for Proof 7 (zero dependencies).
// Reads dist/public/assets after `vite build` and asserts gzip-size caps so
// initial-payload regressions fail CI instead of shipping silently.
//
// Usage: node scripts/frontend/bundle-budget.mjs [--dir dist/public/assets]
// Exit 0 = within budget, 1 = breach (prints offenders).
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

const dirArg = process.argv.find((a) => a.startsWith("--dir="));
const dir = dirArg ? dirArg.slice(6) : "dist/public/assets";

const BUDGETS = {
  totalJsGzipKB: 700,
  entryChunkGzipKB: 150,
  maxChunkRawKB: 550,
};

const RAW_ALLOWLIST = [/Enhanced3DDemo-.*\.js/, /three.*\.js/];

const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
if (files.length === 0) {
  console.error(`No JS assets in ${dir} — run vite build first.`);
  process.exit(1);
}

let totalGzip = 0;
let entryGzip = 0;
const breaches = [];

for (const file of files) {
  const buf = readFileSync(join(dir, file));
  const rawKB = buf.length / 1024;
  const gzipKB = gzipSync(buf).length / 1024;
  totalGzip += gzipKB;
  if (/^index-.*\.js$/.test(file)) entryGzip = Math.max(entryGzip, gzipKB);
  if (rawKB > BUDGETS.maxChunkRawKB && !RAW_ALLOWLIST.some((re) => re.test(file))) {
    breaches.push(`${file}: ${rawKB.toFixed(1)}KB raw > ${BUDGETS.maxChunkRawKB}KB`);
  }
  console.log(`${file} raw=${(buf.length / 1024).toFixed(1)}KB gzip=${gzipKB.toFixed(1)}KB`);
}

console.log(`---`);
console.log(`chunks=${files.length} totalJsGzip=${totalGzip.toFixed(1)}KB entryGzip=${entryGzip.toFixed(1)}KB`);

if (totalGzip > BUDGETS.totalJsGzipKB) {
  breaches.push(`total JS gzip ${totalGzip.toFixed(1)}KB > ${BUDGETS.totalJsGzipKB}KB`);
}
if (entryGzip > BUDGETS.entryChunkGzipKB) {
  breaches.push(`entry chunk gzip ${entryGzip.toFixed(1)}KB > ${BUDGETS.entryChunkGzipKB}KB`);
}

if (breaches.length > 0) {
  console.error("BUDGET BREACH:");
  for (const b of breaches) console.error(`  - ${b}`);
  process.exit(1);
}
console.log("Within budget.");
