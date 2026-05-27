/**
 * csvFingerprintBuilder.ts
 *
 * Reads a raw Gov.uk sponsor CSV, computes a `fingerprint` column for every
 * row, and writes a new CSV with the fingerprint prepended as the first column.
 *
 * The fingerprinted CSV is the input to csvdiff. Using `fingerprint` as the
 * primary key means csvdiff detects additions, deletions, and attribute changes
 * using the same identity logic as our state machine.
 *
 * Output format:
 *   fingerprint,Organisation Name,Town/City,County,Type & Rating,Route
 *   acme|london|worker,ACME LTD,London,,A-Rating,Worker
 *   ...
 *
 * No new npm dependencies — uses only csv-parse (already in package.json)
 * and plain string writing for CSV output.
 */

import fs from "fs";
import path from "path";
import { parse as parseStream } from "csv-parse";
import { generateFingerprint } from "./sponsorListFetcher";
import { sendAdminAlert } from "./adminAlert";
import { logger } from "./logger";
import {
  SponsorRowSchema,
  deriveSponsorRowEnums,
  issueFieldName,
  shouldTriggerSchemaChangeAlert,
  buildSchemaChangeAlertHtml,
} from "./sponsorRowSchema";

// ── CSV quoting ───────────────────────────────────────────────────────────────

/** RFC-4180 compliant field escaping. */
function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function rowToCsvLine(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

// ── Column detection ──────────────────────────────────────────────────────────

interface ColIdx {
  nameIdx: number;
  townIdx: number;
  countyIdx: number;
  typeIdx: number;
  routeIdx: number;
  statusIdx: number;
  licenceTypeIdx: number;
  ratingIdx: number;
  lastUpdatedIdx: number;
}

function detectCols(header: string[]): ColIdx {
  const h = header.map((s) => s.trim().toLowerCase());
  return {
    nameIdx:  h.findIndex((c) => c.includes("organisation") && c.includes("name")),
    townIdx:  h.findIndex((c) => c.includes("town") || c.includes("city")),
    countyIdx: h.findIndex((c) => c.includes("county")),
    typeIdx: h.findIndex((c) => c.includes("type") && c.includes("rating")),
    routeIdx: h.findIndex((c) => c.includes("route")),
    statusIdx: h.findIndex((c) => c.includes("status")),
    licenceTypeIdx: h.findIndex((c) => c.includes("licence") && c.includes("type")),
    ratingIdx: h.findIndex((c) => c.includes("rating") && !c.includes("type")),
    lastUpdatedIdx: h.findIndex((c) => c.includes("last") && c.includes("updated")),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads `rawPath`, adds a `fingerprint` column to every data row,
 * and writes the result to `outputPath`.
 *
 * Idempotent: if `outputPath` already exists and is non-empty, this is a no-op.
 * Returns the output path in both cases.
 */
export async function buildFingerprintedCsv(
  rawPath: string,
  outputPath: string,
): Promise<string> {
  const log = logger.child({ module: "FingerprintBuilder", rawPath, outputPath });
  // Skip if already built
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    logger.info(`[FingerprintBuilder] Already exists: ${path.basename(outputPath)}`);
    return outputPath;
  }

  logger.info(`[FingerprintBuilder] Building fingerprinted CSV → ${path.basename(outputPath)}`);

  const readStream = fs.createReadStream(rawPath);
  const writeStream = fs.createWriteStream(outputPath);
  const parser = parseStream({
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  readStream.pipe(parser);

  let headerRow: string[] | null = null;
  let cols: ColIdx | null = null;
  let rowsWritten = 0;
  let totalRowsProcessed = 0;
  let rowsRejected = 0;
  const rejectionReasons: Record<string, number> = {};

  try {
    for await (const row of parser as AsyncIterable<string[]>) {
      if (!headerRow) {
        headerRow = row;
        cols = detectCols(row);

        if (cols.nameIdx === -1) {
          throw new Error(
            `[FingerprintBuilder] Cannot find "Organisation Name" column. ` +
            `Found: ${row.join(", ")}`,
          );
        }

        // Write header with fingerprint as first column
        const headerLine = rowToCsvLine(["fingerprint", ...row]) + "\n";
        writeStream.write(headerLine);
        continue;
      }

      totalRowsProcessed++;
      const organisationName = (row[cols!.nameIdx] ?? "").trim();
      const townCity = (cols!.townIdx >= 0 ? row[cols!.townIdx] ?? "" : "").trim() || null;
      const county = (cols!.countyIdx >= 0 ? row[cols!.countyIdx] ?? "" : "").trim() || null;
      const typeRating = (cols!.typeIdx >= 0 ? row[cols!.typeIdx] ?? "" : "").trim();
      const route = (cols!.routeIdx >= 0 ? row[cols!.routeIdx] ?? "" : "").trim() || null;
      const statusRaw = (cols!.statusIdx >= 0 ? row[cols!.statusIdx] ?? "" : "").trim() || null;
      const licenceTypeRaw = (cols!.licenceTypeIdx >= 0 ? row[cols!.licenceTypeIdx] ?? "" : "").trim() || null;
      const ratingRaw = (cols!.ratingIdx >= 0 ? row[cols!.ratingIdx] ?? "" : "").trim() || null;
      const lastUpdatedRaw = (cols!.lastUpdatedIdx >= 0 ? row[cols!.lastUpdatedIdx] ?? "" : "").trim() || null;

      const { licenceStatus, rating, licenceType } = deriveSponsorRowEnums({
        statusRaw,
        ratingRaw,
        typeRating,
        licenceTypeRaw,
      });

      const parsed = SponsorRowSchema.safeParse({
        organisationName,
        townCity,
        county,
        typeRating,
        route,
        licenceStatus,
        licenceType,
        rating,
        lastUpdated: lastUpdatedRaw ?? undefined,
      });

      if (!parsed.success) {
        rowsRejected++;
        for (const issue of parsed.error.issues) {
          const field = issueFieldName(issue.path);
          rejectionReasons[field] = (rejectionReasons[field] ?? 0) + 1;
        }
        log.warn(
          {
            rowIndex: totalRowsProcessed,
            errors: parsed.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              code: issue.code,
            })),
            rawRow: row,
          },
          "Sponsor CSV row rejected while building fingerprinted CSV",
        );
        continue;
      }

      const fingerprint = generateFingerprint(
        parsed.data.organisationName,
        // Fingerprint generator expects normalized string components, so null
        // optional values are intentionally coerced to empty strings.
        parsed.data.townCity ?? "",
        parsed.data.route ?? "",
      );
      const dataLine = rowToCsvLine([fingerprint, ...row]) + "\n";
      writeStream.write(dataLine);
      rowsWritten++;
    }
  } catch (err) {
    parser.destroy();
    readStream.destroy();
    writeStream.destroy();
    // Clean up partial output
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    throw err;
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
  });

  const rowsAccepted = rowsWritten;
  log.info(
    {
      totalRowsProcessed,
      rowsAccepted,
      rowsRejected,
      rejectionReasons,
    },
    "Sponsor CSV validation summary (fingerprint builder)",
  );

  const summary = { totalRowsProcessed, rowsAccepted, rowsRejected, rejectionReasons };
  if (shouldTriggerSchemaChangeAlert(summary)) {
    log.error(
      {
        totalRowsProcessed,
        rowsRejected,
        rejectionReasons,
      },
      "Sponsor CSV schema-change event detected in fingerprint builder (>20% rejected rows)",
    );
    await sendAdminAlert(
      "🔴 CheckByAI: Sponsor CSV schema-change event detected",
      `${buildSchemaChangeAlertHtml(`FingerprintBuilder source: ${rawPath}`, summary)}`,
    );
  }

  logger.info(
    `[FingerprintBuilder] Done: ${rowsWritten.toLocaleString()} rows → ${path.basename(outputPath)}`,
  );

  return outputPath;
}

/**
 * Streams the fingerprinted CSV and returns a Set of all fingerprint values.
 * Used by the state machine to check which fingerprints are present in today's register.
 *
 * Memory: ~124k strings × ~50 bytes = ~6 MB (acceptable)
 */
export async function loadFingerprintSet(fingerprintedCsvPath: string): Promise<Set<string>> {
  const readStream = fs.createReadStream(fingerprintedCsvPath);
  const parser = parseStream({
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  readStream.pipe(parser);

  const fpSet = new Set<string>();
  let headerSeen = false;
  let fpColIdx = -1;

  try {
    for await (const row of parser as AsyncIterable<string[]>) {
      if (!headerSeen) {
        headerSeen = true;
        fpColIdx = row.findIndex((c) => c.trim().toLowerCase() === "fingerprint");
        if (fpColIdx === -1) {
          throw new Error(
            "[FingerprintBuilder] Fingerprinted CSV is missing the 'fingerprint' column header.",
          );
        }
        continue;
      }

      const fp = (row[fpColIdx] ?? "").trim();
      if (fp) fpSet.add(fp);
    }
  } catch (err) {
    parser.destroy();
    readStream.destroy();
    throw err;
  }

  return fpSet;
}

/** Returns the expected path for the fingerprinted CSV given a date. */
export function fingerprintedCsvPath(archiveDir: string, date: string): string {
  return path.join(archiveDir, `${date}_sponsors_fp.csv`);
}
