/**
 * Ambient module stubs for packages declared in package.json but not installed.
 * This file has NO exports so it is treated as a global ambient declaration.
 */

// ── pg (PostgreSQL client) ─────────────────────────────────────────────────
declare module "pg" {
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
  }
  export interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
    rowCount: number;
  }
  export class Pool {
    constructor(config?: PoolConfig);
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  export interface PoolClient {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
  }
}

// ── nodemailer ─────────────────────────────────────────────────────────────
declare module "nodemailer" {
  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    service?: string;
  }
  export interface MailOptions {
    from?: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
  }
  export interface Transporter {
    sendMail(options: MailOptions): Promise<{ messageId: string }>;
  }
  export function createTransport(options: TransportOptions | string): Transporter;
}

// ── @privy-io/server-auth ──────────────────────────────────────────────────
declare module "@privy-io/server-auth" {
  export interface LinkedAccount {
    type: string;
    address?: string;
    walletClientType?: string;
    chainType?: string;
  }
  export interface PrivyUser {
    id: string;
    linkedAccounts: LinkedAccount[];
  }
  export class PrivyClient {
    constructor(appId: string, appSecret: string, config?: Record<string, unknown>);
    createWallet(options?: { userId?: string; chainType?: string }): Promise<{ address: string }>;
    createWallets(options?: Record<string, unknown>): Promise<PrivyUser>;
    getUser(userId: string): Promise<PrivyUser>;
    getUserByCustomAuthId(customAuthId: string): Promise<PrivyUser | null>;
    importUser(options: Record<string, unknown>): Promise<PrivyUser>;
    verifyAuthToken(token: string): Promise<{ userId: string }>;
  }
}
