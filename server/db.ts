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
  // Keep the pool small — Neon serverless charges per active connection and
  // auto-pauses on idle. Large pools cause cascading cold-start failures.
  max: 10,
  // Release idle connections quickly so Neon can auto-pause between cron runs.
  idleTimeoutMillis: 30_000,
  // Fail fast if the pool is saturated rather than queuing indefinitely.
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle({ client: pool, schema });