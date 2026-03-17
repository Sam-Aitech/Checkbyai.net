import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Increased pool size to 20 to support concurrent background reconciliation
  // and real-time user verification requests without saturating.
  max: 20,
  // Release idle connections quickly so Neon can auto-pause between cron runs.
  idleTimeoutMillis: 30_000,
  // Increased timeout slightly to allow for heavy background operations.
  connectionTimeoutMillis: 15_000,
});
export const db = drizzle({ client: pool, schema });