/**
 * Bridge Permission Service
 *
 * Manages per-agent capability permissions and enforces them before
 * dispatching bridge commands to the local machine.
 *
 * Permissions are stored in Supabase so the web dashboard can display
 * and modify them. The Bridge client reads these at connection time and
 * re-checks on each command execution.
 *
 * Capability categories:
 * - filesystem: read/write/move/search within user-approved directories
 * - shell: execute commands from an agent-specific allow list
 * - browser: open tabs, navigate, fill forms via Playwright
 * - notifications: surface OS-level notifications
 *
 * Suspicious patterns (rm -rf, mass reads outside permitted dirs, etc.)
 * are flagged before execution and require explicit user confirmation.
 */

import { pool } from "../auth/db";

export type CapabilityType = "filesystem" | "shell" | "browser" | "notifications";

export interface AgentPermissions {
  agentId: string;
  userId: string;
  capabilities: CapabilityType[];
  allowedDirectories: string[];
  allowedCommands: string[];
  blockedCommands: string[];
  bridgeEnabled: boolean;
  updatedAt: Date;
}

export async function initBridgeSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bridge_permissions (
      agent_id            UUID NOT NULL,
      user_id             UUID NOT NULL,
      capabilities        JSONB NOT NULL DEFAULT '[]',
      allowed_directories JSONB NOT NULL DEFAULT '[]',
      allowed_commands    JSONB NOT NULL DEFAULT '[]',
      blocked_commands    JSONB NOT NULL DEFAULT '[]',
      bridge_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at          TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (agent_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS bridge_audit_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id        UUID NOT NULL,
      user_id         UUID NOT NULL,
      capability      TEXT NOT NULL,
      command         TEXT NOT NULL,
      args            JSONB,
      outcome         TEXT NOT NULL CHECK (outcome IN ('allowed', 'blocked', 'pending_approval', 'executed', 'failed')),
      error           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON bridge_audit_log(agent_id, user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS bridge_pending_approvals (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id        UUID NOT NULL,
      user_id         UUID NOT NULL,
      capability      TEXT NOT NULL,
      command         TEXT NOT NULL,
      args            JSONB,
      reason          TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ
    );
  `);
}

function rowToPermissions(row: Record<string, unknown>): AgentPermissions {
  return {
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    capabilities: (row.capabilities as CapabilityType[]) ?? [],
    allowedDirectories: (row.allowed_directories as string[]) ?? [],
    allowedCommands: (row.allowed_commands as string[]) ?? [],
    blockedCommands: (row.blocked_commands as string[]) ?? [],
    bridgeEnabled: (row.bridge_enabled as boolean) ?? false,
    updatedAt: row.updated_at as Date,
  };
}

export async function getPermissions(agentId: string, userId: string): Promise<AgentPermissions> {
  const result = await pool.query(
    "SELECT * FROM bridge_permissions WHERE agent_id = $1 AND user_id = $2",
    [agentId, userId]
  );
  if (!result.rows[0]) {
    return {
      agentId,
      userId,
      capabilities: [],
      allowedDirectories: [],
      allowedCommands: [],
      blockedCommands: [],
      bridgeEnabled: false,
      updatedAt: new Date(),
    };
  }
  return rowToPermissions(result.rows[0]);
}

export async function updatePermissions(
  agentId: string,
  userId: string,
  patch: Partial<Omit<AgentPermissions, "agentId" | "userId" | "updatedAt">>
): Promise<AgentPermissions> {
  const current = await getPermissions(agentId, userId);
  const merged: AgentPermissions = { ...current, ...patch, agentId, userId, updatedAt: new Date() };

  await pool.query(
    `INSERT INTO bridge_permissions
       (agent_id, user_id, capabilities, allowed_directories, allowed_commands, blocked_commands, bridge_enabled, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, NOW())
     ON CONFLICT (agent_id, user_id) DO UPDATE SET
       capabilities        = EXCLUDED.capabilities,
       allowed_directories = EXCLUDED.allowed_directories,
       allowed_commands    = EXCLUDED.allowed_commands,
       blocked_commands    = EXCLUDED.blocked_commands,
       bridge_enabled      = EXCLUDED.bridge_enabled,
       updated_at          = NOW()`,
    [
      agentId, userId,
      JSON.stringify(merged.capabilities),
      JSON.stringify(merged.allowedDirectories),
      JSON.stringify(merged.allowedCommands),
      JSON.stringify(merged.blockedCommands),
      merged.bridgeEnabled,
    ]
  );

  return merged;
}

/** Suspicious patterns that require user approval before execution */
const SUSPICIOUS_PATTERNS = [
  /rm\s+-[rf]+/i,
  /format\s+[a-z]:/i,
  /del\s+\/[sqf]/i,
  /curl\s+.*\|\s*sh/i,
  /wget\s+.*\|\s*sh/i,
  />(\/dev\/null|\/etc\/|\/boot\/)/i,
];

export type CheckResult =
  | { allowed: true }
  | { allowed: false; reason: string }
  | { requiresApproval: true; reason: string };

export function checkCommand(
  permissions: AgentPermissions,
  capability: CapabilityType,
  command: string
): CheckResult {
  if (!permissions.bridgeEnabled) {
    return { allowed: false, reason: "Bridge not enabled for this agent" };
  }
  if (!permissions.capabilities.includes(capability)) {
    return { allowed: false, reason: `Capability '${capability}' not granted to this agent` };
  }
  if (permissions.blockedCommands.some((bc) => command.toLowerCase().includes(bc.toLowerCase()))) {
    return { allowed: false, reason: "Command is on the agent's block list" };
  }
  if (
    capability === "shell" &&
    permissions.allowedCommands.length > 0 &&
    !permissions.allowedCommands.some((ac) => command.toLowerCase().startsWith(ac.toLowerCase()))
  ) {
    return { allowed: false, reason: "Command is not on the agent's allow list" };
  }
  if (
    capability === "filesystem" &&
    permissions.allowedDirectories.length > 0 &&
    !permissions.allowedDirectories.some((dir) =>
      command.toLowerCase().includes(dir.toLowerCase())
    )
  ) {
    return { allowed: false, reason: "Path is outside permitted directories" };
  }
  if (SUSPICIOUS_PATTERNS.some((p) => p.test(command))) {
    return { requiresApproval: true, reason: "Suspicious command pattern detected" };
  }
  return { allowed: true };
}

export async function logAudit(entry: {
  agentId: string;
  userId: string;
  capability: CapabilityType;
  command: string;
  args?: unknown;
  outcome: "allowed" | "blocked" | "pending_approval" | "executed" | "failed";
  error?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO bridge_audit_log (agent_id, user_id, capability, command, args, outcome, error)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      entry.agentId, entry.userId, entry.capability, entry.command,
      entry.args ? JSON.stringify(entry.args) : null,
      entry.outcome, entry.error ?? null,
    ]
  );
}

export async function createPendingApproval(entry: {
  agentId: string;
  userId: string;
  capability: CapabilityType;
  command: string;
  args?: unknown;
  reason: string;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO bridge_pending_approvals (agent_id, user_id, capability, command, args, reason)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      entry.agentId, entry.userId, entry.capability, entry.command,
      entry.args ? JSON.stringify(entry.args) : null,
      entry.reason,
    ]
  );
  return result.rows[0].id as string;
}

export async function resolveApproval(
  approvalId: string,
  userId: string,
  status: "approved" | "denied"
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE bridge_pending_approvals SET status = $1, resolved_at = NOW()
     WHERE id = $2 AND user_id = $3 AND status = 'pending' RETURNING id`,
    [status, approvalId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getAuditLog(
  agentId: string,
  userId: string,
  limit = 50
): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    "SELECT * FROM bridge_audit_log WHERE agent_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3",
    [agentId, userId, limit]
  );
  return result.rows;
}

export async function getPendingApprovals(userId: string): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    "SELECT * FROM bridge_pending_approvals WHERE user_id = $1 AND status = 'pending' ORDER BY created_at ASC",
    [userId]
  );
  return result.rows;
}
