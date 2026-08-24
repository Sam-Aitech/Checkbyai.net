import 'dotenv/config';
import { db } from "./server/db";
import { sponsorCanonical } from "./shared/schema";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.select({ count: sql<number>`count(*)` }).from(sponsorCanonical);
  console.log(`Total sponsorCanonical count: ${result[0].count}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
