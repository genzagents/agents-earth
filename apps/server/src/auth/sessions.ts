import { pool } from "./db";
import { randomBytes } from "crypto";

const SESSION_TTL_DAYS = 30;

export interface Session {
  id: string;
  userId: string;
  sessionToken: string;
  expires: Date;
}

export async function createSession(userId: string): Promise<Session> {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `INSERT INTO sessions (user_id, expires, session_token)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, expires, sessionToken]
  );

  const row = result.rows[0];
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sessionToken: row.session_token as string,
    expires: row.expires as Date,
  };
}

export async function findSession(sessionToken: string): Promise<Session | null> {
  const result = await pool.query(
    "SELECT * FROM sessions WHERE session_token = $1 AND expires > NOW()",
    [sessionToken]
  );

  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sessionToken: row.session_token as string,
    expires: row.expires as Date,
  };
}

export async function deleteSession(sessionToken: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE session_token = $1", [sessionToken]);
}
