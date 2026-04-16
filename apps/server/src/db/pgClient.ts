import { Pool } from "pg";

// Prefer DATABASE_URL; fall back to individual Supabase env vars.
function makeConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }
  return {
    host: process.env.SUPABASE_DB_HOST || "db.ihdfohtjjtjfjxqsacgm.supabase.co",
    port: parseInt(process.env.SUPABASE_DB_PORT || "5432", 10),
    database: process.env.SUPABASE_DB_NAME || "postgres",
    user: process.env.SUPABASE_DB_USER || "postgres",
    password: process.env.SUPABASE_DB_PASSWORD || "supabase@123",
    ssl: { rejectUnauthorized: false },
  };
}

export const pool = new Pool(makeConnectionConfig());
