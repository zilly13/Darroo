import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// A small pool is enough: this process runs a handful of cron jobs plus a
// low-traffic internal web server, never a public high-concurrency app.
export const pool = new Pool({ connectionString: databaseUrl, max: 5 });

export const db = drizzle(pool, { schema });
