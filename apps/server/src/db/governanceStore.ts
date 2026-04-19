/**
 * Governance Store — persists working groups, bounties, and governance proposals.
 *
 * Uses the same PostgreSQL world_state singleton pattern as WorldStore but under
 * a separate key, so the governance data is completely decoupled from the main
 * simulation store. This allows incremental adoption without touching store.ts.
 *
 * Falls back to in-memory when pool is unavailable (e.g. local dev without PG).
 */

import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkingGroup {
  id: string;
  name: string;
  description: string;
  memberAgentIds: string[];
  walletAddress?: string;
  walletTxHash?: string;
  createdAt: number;
}

export type BountyStatus = "open" | "escrowed" | "released" | "refunded" | "cancelled";

export interface Bounty {
  id: string;
  title: string;
  description: string;
  amountWei: string;
  depositorAgentId?: string;
  recipientAgentId?: string;
  status: BountyStatus;
  escrowTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;
  workingGroupId?: string;
  createdAt: number;
  updatedAt: number;
}

export type VoteChoice = "yes" | "no" | "abstain";
export type ProposalStatus = "open" | "finalized" | "cancelled";

export interface GovernanceVote {
  agentId: string;
  choice: VoteChoice;
  reputationWeight: number;
  didSignature?: string;
  castAt: number;
  onChainTxHash?: string;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  creatorAgentId: string;
  status: ProposalStatus;
  deadline?: number;
  votes: GovernanceVote[];
  tally: { yes: number; no: number; abstain: number };
  onChainTxHash?: string;
  workingGroupId?: string;
  createdAt: number;
  updatedAt: number;
}

interface GovernanceData {
  workingGroups: WorkingGroup[];
  bounties: Bounty[];
  proposals: GovernanceProposal[];
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const SINGLETON_KEY = "governance";

async function loadFromDb(): Promise<GovernanceData | null> {
  try {
    const { pool } = await import("./pgClient");
    const result = await pool.query<{ data: GovernanceData }>(
      "SELECT data FROM world_state WHERE id = $1",
      [SINGLETON_KEY]
    );
    if (result.rows.length > 0) return result.rows[0].data as GovernanceData;
    return null;
  } catch {
    return null;
  }
}

async function saveToDb(data: GovernanceData): Promise<void> {
  try {
    const { pool } = await import("./pgClient");
    await pool.query(
      `INSERT INTO world_state (id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
      [SINGLETON_KEY, JSON.stringify(data)]
    );
  } catch (err) {
    console.warn("[governanceStore] DB save failed — data lives in memory only:", err);
  }
}

// ---------------------------------------------------------------------------
// GovernanceStore class
// ---------------------------------------------------------------------------

class GovernanceStore {
  private data: GovernanceData = { workingGroups: [], bounties: [], proposals: [] };
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    const saved = await loadFromDb();
    if (saved) {
      this.data = {
        workingGroups: saved.workingGroups ?? [],
        bounties: saved.bounties ?? [],
        proposals: saved.proposals ?? [],
      };
    }
    this.initialized = true;
  }

  async save(): Promise<void> {
    await saveToDb(this.data);
  }

  // ── Working groups ────────────────────────────────────────────────────────

  get workingGroups(): WorkingGroup[] { return this.data.workingGroups; }

  addWorkingGroup(group: WorkingGroup): void {
    this.data.workingGroups.push(group);
  }

  getWorkingGroup(id: string): WorkingGroup | undefined {
    return this.data.workingGroups.find(g => g.id === id);
  }

  updateWorkingGroup(id: string, updates: Partial<WorkingGroup>): void {
    const idx = this.data.workingGroups.findIndex(g => g.id === id);
    if (idx >= 0) this.data.workingGroups[idx] = { ...this.data.workingGroups[idx], ...updates };
  }

  // ── Bounties ──────────────────────────────────────────────────────────────

  get bounties(): Bounty[] { return this.data.bounties; }

  addBounty(bounty: Bounty): void {
    this.data.bounties.push(bounty);
  }

  getBounty(id: string): Bounty | undefined {
    return this.data.bounties.find(b => b.id === id);
  }

  updateBounty(id: string, updates: Partial<Bounty>): void {
    const idx = this.data.bounties.findIndex(b => b.id === id);
    if (idx >= 0) this.data.bounties[idx] = { ...this.data.bounties[idx], ...updates };
  }

  // ── Governance proposals ──────────────────────────────────────────────────

  get proposals(): GovernanceProposal[] { return this.data.proposals; }

  addProposal(proposal: GovernanceProposal): void {
    this.data.proposals.push(proposal);
  }

  getProposal(id: string): GovernanceProposal | undefined {
    return this.data.proposals.find(p => p.id === id);
  }

  updateProposal(id: string, updates: Partial<GovernanceProposal>): void {
    const idx = this.data.proposals.findIndex(p => p.id === id);
    if (idx >= 0) this.data.proposals[idx] = { ...this.data.proposals[idx], ...updates };
  }

  addVoteToProposal(proposalId: string, vote: GovernanceVote): boolean {
    const proposal = this.getProposal(proposalId);
    if (!proposal || proposal.status !== "open") return false;
    if (proposal.votes.some(v => v.agentId === vote.agentId)) return false;
    proposal.votes.push(vote);
    proposal.tally[vote.choice] += vote.reputationWeight;
    proposal.updatedAt = Date.now();
    return true;
  }
}

export const governanceStore = new GovernanceStore();
