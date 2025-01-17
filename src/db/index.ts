import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 0,
  query_timeout: 0,
  keepAlive: true,
  max: 20,
  idleTimeoutMillis: 0,
  allowExitOnIdle: true,
});

// Disable statement caching
pool.on("connect", (client) => {
  client.on("notice", (msg) => console.log("notice:", msg));
});

export const db = drizzle(pool, { schema });
