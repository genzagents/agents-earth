import { Pool } from "pg";

// Prefer DATABASE_URL; fall back to individual Supabase env vars.
// All values are required — no hardcoded fallbacks.
function makeConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }
  const host = process.env.SUPABASE_DB_HOST;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!host || !password) {
    throw new Error(
      "Database configuration missing: set DATABASE_URL or SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD env vars"
    );
  }
  return {
    host,
    port: parseInt(process.env.SUPABASE_DB_PORT || "5432", 10),
    database: process.env.SUPABASE_DB_NAME || "postgres",
    user: process.env.SUPABASE_DB_USER || "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  };
}

export const pool = new Pool(makeConnectionConfig());
