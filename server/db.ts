import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { logger } from "./utils/logger";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 10_000,
} as any);

pool.on("error", (err: Error & { code?: string }) => {
  logger.error(
    {
      err,
      code: err.code,
    },
    "Unexpected error on an idle database client; the pool will discard the client",
  );
});

export const db = drizzle({ client: pool, schema });