import { pool } from "../auth/db";

export interface OwnedAgent {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  avatarColor: string | null;
  sourceType: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

function rowToAgent(row: Record<string, unknown>): OwnedAgent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    systemPrompt: (row.system_prompt as string) ?? "",
    model: (row.model as string) ?? "claude-sonnet-4-6",
    avatarColor: (row.avatar_color as string | null) ?? null,
    sourceType: (row.source_type as string) ?? "manual",
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function findAgentById(id: string): Promise<OwnedAgent | null> {
  const result = await pool.query("SELECT * FROM owned_agents WHERE id = $1", [id]);
  return result.rows[0] ? rowToAgent(result.rows[0]) : null;
}

export async function findAgentsByUser(userId: string): Promise<OwnedAgent[]> {
  const result = await pool.query(
    "SELECT * FROM owned_agents WHERE user_id = $1 ORDER BY created_at ASC",
    [userId]
  );
  return result.rows.map(rowToAgent);
}

export async function createAgent(params: {
  userId: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  avatarColor?: string;
  sourceType?: string;
}): Promise<OwnedAgent> {
  const result = await pool.query(
    `INSERT INTO owned_agents (user_id, name, description, system_prompt, model, avatar_color, source_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      params.userId,
      params.name,
      params.description ?? null,
      params.systemPrompt ?? "",
      params.model ?? "claude-sonnet-4-6",
      params.avatarColor ?? null,
      params.sourceType ?? "manual",
    ]
  );
  return rowToAgent(result.rows[0]);
}

export async function updateAgent(
  id: string,
  userId: string,
  params: Partial<Pick<OwnedAgent, "name" | "description" | "systemPrompt" | "model" | "avatarColor">>
): Promise<OwnedAgent | null> {
  const setClauses: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];
  let idx = 1;

  if (params.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(params.name); }
  if (params.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(params.description); }
  if (params.systemPrompt !== undefined) { setClauses.push(`system_prompt = $${idx++}`); values.push(params.systemPrompt); }
  if (params.model !== undefined) { setClauses.push(`model = $${idx++}`); values.push(params.model); }
  if (params.avatarColor !== undefined) { setClauses.push(`avatar_color = $${idx++}`); values.push(params.avatarColor); }

  values.push(id, userId);
  const result = await pool.query(
    `UPDATE owned_agents SET ${setClauses.join(", ")} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ? rowToAgent(result.rows[0]) : null;
}

export async function deleteAgent(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM owned_agents WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// --- Conversation (working memory) ---

export async function getConversation(agentId: string, userId: string): Promise<ConversationMessage[]> {
  const result = await pool.query(
    "SELECT messages FROM conversations WHERE agent_id = $1 AND user_id = $2",
    [agentId, userId]
  );
  if (!result.rows[0]) return [];
  return result.rows[0].messages as ConversationMessage[];
}

export async function appendToConversation(
  agentId: string,
  userId: string,
  newMessages: ConversationMessage[]
): Promise<void> {
  await pool.query(
    `INSERT INTO conversations (agent_id, user_id, messages, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (agent_id, user_id) DO UPDATE
       SET messages = (conversations.messages || $3::jsonb),
           updated_at = NOW()`,
    [agentId, userId, JSON.stringify(newMessages)]
  );
}

export async function clearConversation(agentId: string, userId: string): Promise<void> {
  await pool.query(
    "UPDATE conversations SET messages = '[]', updated_at = NOW() WHERE agent_id = $1 AND user_id = $2",
    [agentId, userId]
  );
}
