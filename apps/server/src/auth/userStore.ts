import { pool } from "./db";

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  walletAddress: string | null;
  subscription: string;
  bridgeInstalled: boolean;
  totalContributedToCommons: number;
  createdAt: Date;
  updatedAt: Date;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    image: (row.image as string | null) ?? null,
    walletAddress: (row.wallet_address as string | null) ?? null,
    subscription: (row.subscription as string) ?? "free",
    bridgeInstalled: (row.bridge_installed as boolean) ?? false,
    totalContributedToCommons: Number(row.total_contributed_to_commons ?? 0),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function createUser(email: string, name?: string): Promise<User> {
  const result = await pool.query(
    `INSERT INTO users (email, name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [email, name ?? null]
  );
  return rowToUser(result.rows[0]);
}

export async function updateUserWallet(userId: string, walletAddress: string): Promise<User | null> {
  const result = await pool.query(
    `UPDATE users SET wallet_address = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [walletAddress, userId]
  );
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}
