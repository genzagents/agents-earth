import { randomBytes, createHmac } from "crypto";
import { pool } from "./db";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const HMAC_SECRET = process.env.AUTH_SECRET ?? "dev-magic-link-secret-change-in-production";

/** Generate a signed magic link token and persist it. */
export async function createMagicToken(email: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const token = signToken(raw, email);
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Remove any existing token for this email first
  await pool.query("DELETE FROM verification_tokens WHERE identifier = $1", [email]);

  await pool.query(
    "INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, $3)",
    [email, token, expires]
  );

  return token;
}

/** Verify and consume a magic token. Returns the email if valid, throws otherwise. */
export async function consumeMagicToken(token: string): Promise<string> {
  const result = await pool.query(
    "DELETE FROM verification_tokens WHERE token = $1 AND expires > NOW() RETURNING identifier",
    [token]
  );

  if (!result.rows[0]) {
    throw new Error("Invalid or expired magic link token");
  }

  const email = result.rows[0].identifier as string;

  // Verify HMAC to guard against DB-only attacks
  if (!verifyToken(token, email)) {
    throw new Error("Token signature mismatch");
  }

  return email;
}

function signToken(raw: string, email: string): string {
  const hmac = createHmac("sha256", HMAC_SECRET).update(`${raw}:${email}`).digest("hex");
  return `${raw}.${hmac}`;
}

function verifyToken(token: string, email: string): boolean {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const raw = token.slice(0, dotIdx);
  const expected = signToken(raw, email);
  return expected === token;
}
