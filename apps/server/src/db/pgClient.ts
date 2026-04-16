import { Pool } from "pg";

// Prefer DATABASE_URL; fall back to individual Supabase env vars.
// All credentials must be supplied via environment variables — no hardcoded fallbacks.
function makeConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error("SUPABASE_DB_PASSWORD env var is required");
  const host = process.env.SUPABASE_DB_HOST;
  if (!host) throw new Error("SUPABASE_DB_HOST env var is required");
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
