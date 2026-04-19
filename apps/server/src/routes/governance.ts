/**
 * Governance Routes — REST API for on-chain community mechanics.
 *
 * Working Groups:
 *   POST   /api/governance/working-groups          — create a working group
 *   GET    /api/governance/working-groups          — list working groups
 *   GET    /api/governance/working-groups/:id      — get a working group
 *   POST   /api/governance/working-groups/:id/wallet — provision multisig wallet
 *
 * Bounties:
 *   POST   /api/governance/bounties                — create a bounty
 *   GET    /api/governance/bounties                — list bounties
 *   GET    /api/governance/bounties/:id            — get a bounty
 *   POST   /api/governance/bounties/:id/deposit    — deposit escrow
 *   POST   /api/governance/bounties/:id/release    — release escrow to recipient
 *   POST   /api/governance/bounties/:id/refund     — refund escrow to depositor
 *
 * Governance Proposals:
 *   POST   /api/governance/proposals               — create a proposal
 *   GET    /api/governance/proposals               — list proposals
 *   GET    /api/governance/proposals/:id           — get a proposal
 *   POST   /api/governance/proposals/:id/vote      — cast a vote
 *   POST   /api/governance/proposals/:id/finalize  — finalize a proposal
 *   GET    /api/governance/proposals/:id/tally     — get vote tally
 *
 * Treasury:
 *   GET    /api/governance/treasury                — get treasury info
 */

import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { governanceStore } from "../db/governanceStore";
import type { WorkingGroup, Bounty, GovernanceProposal, GovernanceVote, VoteChoice } from "../db/governanceStore";
import { createGroupWallet, getTreasuryAddress } from "../community/multisigService";
import { depositEscrow, releaseEscrow, refundEscrow, getEscrowState } from "../community/escrowService";
import {
  anchorProposalOnChain,
  anchorVoteOnChain,
  finalizeProposalOnChain,
  getOnChainTally,
} from "../community/governanceService";

export async function governanceRoutes(fastify: FastifyInstance) {

  // ==========================================================================
  // Working Groups
  // ==========================================================================

  fastify.post(
    "/api/governance/working-groups",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:          { type: "string", minLength: 1, maxLength: 100 },
            description:   { type: "string", maxLength: 2000 },
            memberAgentIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { name: string; description?: string; memberAgentIds?: string[] };
      }>,
      reply: FastifyReply
    ) => {
      const { name, description = "", memberAgentIds = [] } = request.body;
      const group: WorkingGroup = {
        id: uuidv4(),
        name,
        description,
        memberAgentIds,
        createdAt: Date.now(),
      };
      governanceStore.addWorkingGroup(group);
      await governanceStore.save();
      return reply.code(201).send(group);
    }
  );

  fastify.get("/api/governance/working-groups", async () => {
    return governanceStore.workingGroups;
  });

  fastify.get(
    "/api/governance/working-groups/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const group = governanceStore.getWorkingGroup(request.params.id);
      if (!group) return reply.code(404).send({ error: "Working group not found" });
      return group;
    }
  );

  /**
   * POST /api/governance/working-groups/:id/wallet
   * Deploys a WorkingGroupWallet multisig for this group.
   * Body: { memberAddresses: string[], threshold: number }
   */
  fastify.post(
    "/api/governance/working-groups/:id/wallet",
    {
      schema: {
        body: {
          type: "object",
          required: ["memberAddresses", "threshold"],
          properties: {
            memberAddresses: { type: "array", items: { type: "string" }, minItems: 1 },
            threshold:       { type: "number", minimum: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { memberAddresses: string[]; threshold: number };
      }>,
      reply: FastifyReply
    ) => {
      const group = governanceStore.getWorkingGroup(request.params.id);
      if (!group) return reply.code(404).send({ error: "Working group not found" });
      if (group.walletAddress) {
        return reply.code(409).send({ error: "Wallet already provisioned", walletAddress: group.walletAddress });
      }

      const { memberAddresses, threshold } = request.body;
      if (threshold > memberAddresses.length) {
        return reply.code(400).send({ error: "threshold cannot exceed member count" });
      }

      try {
        const { walletAddress, txHash } = await createGroupWallet(group.id, memberAddresses, threshold);
        governanceStore.updateWorkingGroup(group.id, { walletAddress, walletTxHash: txHash });
        await governanceStore.save();
        return reply.code(201).send({ walletAddress, txHash });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: `Wallet deployment failed: ${msg}` });
      }
    }
  );

  // ==========================================================================
  // Bounties
  // ==========================================================================

  fastify.post(
    "/api/governance/bounties",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "amountWei"],
          properties: {
            title:          { type: "string", minLength: 1, maxLength: 200 },
            description:    { type: "string", maxLength: 4000 },
            amountWei:      { type: "string", pattern: "^[0-9]+$" },
            depositorAgentId: { type: "string" },
            workingGroupId: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          title: string;
          description?: string;
          amountWei: string;
          depositorAgentId?: string;
          workingGroupId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { title, description = "", amountWei, depositorAgentId, workingGroupId } = request.body;
      const now = Date.now();
      const bounty: Bounty = {
        id: uuidv4(),
        title,
        description,
        amountWei,
        depositorAgentId,
        workingGroupId,
        status: "open",
        createdAt: now,
        updatedAt: now,
      };
      governanceStore.addBounty(bounty);
      await governanceStore.save();
      return reply.code(201).send(bounty);
    }
  );

  fastify.get("/api/governance/bounties", async () => {
    return governanceStore.bounties;
  });

  fastify.get(
    "/api/governance/bounties/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const bounty = governanceStore.getBounty(request.params.id);
      if (!bounty) return reply.code(404).send({ error: "Bounty not found" });
      return bounty;
    }
  );

  /** POST /api/governance/bounties/:id/deposit — lock funds in escrow */
  fastify.post(
    "/api/governance/bounties/:id/deposit",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const bounty = governanceStore.getBounty(request.params.id);
      if (!bounty) return reply.code(404).send({ error: "Bounty not found" });
      if (bounty.status !== "open") {
        return reply.code(409).send({ error: `Bounty is already ${bounty.status}` });
      }

      try {
        const txHash = await depositEscrow(
          bounty.id,
          BigInt(bounty.amountWei),
          bounty.depositorAgentId ?? "treasury"
        );
        governanceStore.updateBounty(bounty.id, { status: "escrowed", escrowTxHash: txHash, updatedAt: Date.now() });
        await governanceStore.save();
        return reply.send({ txHash, status: "escrowed" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: `Escrow deposit failed: ${msg}` });
      }
    }
  );

  /** POST /api/governance/bounties/:id/release — release to recipient on resolution */
  fastify.post(
    "/api/governance/bounties/:id/release",
    {
      schema: {
        body: {
          type: "object",
          required: ["recipientAddress"],
          properties: {
            recipientAddress:  { type: "string" },
            recipientAgentId:  { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { recipientAddress: string; recipientAgentId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const bounty = governanceStore.getBounty(request.params.id);
      if (!bounty) return reply.code(404).send({ error: "Bounty not found" });
      if (bounty.status !== "escrowed") {
        return reply.code(409).send({ error: `Bounty is ${bounty.status}, not escrowed` });
      }

      const { recipientAddress, recipientAgentId } = request.body;

      try {
        const txHash = await releaseEscrow(bounty.id, recipientAddress);
        governanceStore.updateBounty(bounty.id, {
          status: "released",
          releaseTxHash: txHash,
          recipientAgentId,
          updatedAt: Date.now(),
        });
        await governanceStore.save();
        return reply.send({ txHash, status: "released" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: `Escrow release failed: ${msg}` });
      }
    }
  );

  /** POST /api/governance/bounties/:id/refund — refund to depositor */
  fastify.post(
    "/api/governance/bounties/:id/refund",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const bounty = governanceStore.getBounty(request.params.id);
      if (!bounty) return reply.code(404).send({ error: "Bounty not found" });
      if (bounty.status !== "escrowed") {
        return reply.code(409).send({ error: `Bounty is ${bounty.status}, not escrowed` });
      }

      try {
        const txHash = await refundEscrow(bounty.id);
        governanceStore.updateBounty(bounty.id, { status: "refunded", refundTxHash: txHash, updatedAt: Date.now() });
        await governanceStore.save();
        return reply.send({ txHash, status: "refunded" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: `Escrow refund failed: ${msg}` });
      }
    }
  );

  // ==========================================================================
  // Governance Proposals
  // ==========================================================================

  fastify.post(
    "/api/governance/proposals",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "creatorAgentId"],
          properties: {
            title:           { type: "string", minLength: 1, maxLength: 200 },
            description:     { type: "string", maxLength: 8000 },
            creatorAgentId:  { type: "string" },
            deadline:        { type: "number" },
            workingGroupId:  { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          title: string;
          description?: string;
          creatorAgentId: string;
          deadline?: number;
          workingGroupId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { title, description = "", creatorAgentId, deadline, workingGroupId } = request.body;
      const now = Date.now();
      const proposal: GovernanceProposal = {
        id: uuidv4(),
        title,
        description,
        creatorAgentId,
        status: "open",
        deadline,
        workingGroupId,
        votes: [],
        tally: { yes: 0, no: 0, abstain: 0 },
        createdAt: now,
        updatedAt: now,
      };

      // Anchor on-chain (non-blocking)
      anchorProposalOnChain(proposal.id, title, deadline).then(txHash => {
        governanceStore.updateProposal(proposal.id, { onChainTxHash: txHash });
        governanceStore.save().catch(() => {});
      }).catch(err => {
        console.error("[governance] Failed to anchor proposal on-chain:", err);
      });

      governanceStore.addProposal(proposal);
      await governanceStore.save();
      return reply.code(201).send(proposal);
    }
  );

  fastify.get("/api/governance/proposals", async () => {
    return governanceStore.proposals;
  });

  fastify.get(
    "/api/governance/proposals/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const proposal = governanceStore.getProposal(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "Proposal not found" });
      return proposal;
    }
  );

  /**
   * POST /api/governance/proposals/:id/vote
   * Cast a reputation-weighted vote for an agent.
   * Body: { agentId, choice, reputationWeight, didSignature? }
   */
  fastify.post(
    "/api/governance/proposals/:id/vote",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId", "choice", "reputationWeight"],
          properties: {
            agentId:          { type: "string" },
            choice:           { type: "string", enum: ["yes", "no", "abstain"] },
            reputationWeight: { type: "number", minimum: 0 },
            didSignature:     { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          agentId: string;
          choice: VoteChoice;
          reputationWeight: number;
          didSignature?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const proposal = governanceStore.getProposal(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "Proposal not found" });
      if (proposal.status !== "open") {
        return reply.code(409).send({ error: `Proposal is ${proposal.status}` });
      }
      if (proposal.deadline && Date.now() > proposal.deadline) {
        return reply.code(409).send({ error: "Proposal deadline has passed" });
      }

      const { agentId, choice, reputationWeight, didSignature } = request.body;
      const vote: GovernanceVote = {
        agentId,
        choice,
        reputationWeight,
        didSignature,
        castAt: Date.now(),
      };

      const added = governanceStore.addVoteToProposal(proposal.id, vote);
      if (!added) {
        return reply.code(409).send({ error: "Agent has already voted on this proposal" });
      }

      // Anchor vote on-chain (non-blocking)
      anchorVoteOnChain(proposal.id, agentId, choice, reputationWeight, didSignature).then(txHash => {
        vote.onChainTxHash = txHash;
        governanceStore.save().catch(() => {});
      }).catch(err => {
        console.error("[governance] Failed to anchor vote on-chain:", err);
      });

      await governanceStore.save();
      return reply.code(201).send({ vote, tally: proposal.tally });
    }
  );

  /**
   * POST /api/governance/proposals/:id/finalize
   * Closes a proposal and records the final tally.
   */
  fastify.post(
    "/api/governance/proposals/:id/finalize",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const proposal = governanceStore.getProposal(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "Proposal not found" });
      if (proposal.status !== "open") {
        return reply.code(409).send({ error: `Proposal is already ${proposal.status}` });
      }

      governanceStore.updateProposal(proposal.id, { status: "finalized", updatedAt: Date.now() });

      // Finalize on-chain (non-blocking)
      finalizeProposalOnChain(proposal.id).catch(err => {
        console.error("[governance] Failed to finalize proposal on-chain:", err);
      });

      await governanceStore.save();
      const updated = governanceStore.getProposal(proposal.id)!;
      return reply.send(updated);
    }
  );

  /**
   * GET /api/governance/proposals/:id/tally
   * Returns the current vote tally, optionally enriched with on-chain data.
   */
  fastify.get(
    "/api/governance/proposals/:id/tally",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const proposal = governanceStore.getProposal(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "Proposal not found" });

      const offChainTally = proposal.tally;
      const totalWeight = offChainTally.yes + offChainTally.no + offChainTally.abstain;
      const voteCount = proposal.votes.length;

      const onChain = await getOnChainTally(proposal.id);

      return reply.send({
        proposalId: proposal.id,
        status: proposal.status,
        voteCount,
        totalWeight,
        tally: offChainTally,
        onChain: onChain
          ? {
              yesWeight:     onChain.yesWeight.toString(),
              noWeight:      onChain.noWeight.toString(),
              abstainWeight: onChain.abstainWeight.toString(),
              finalized:     onChain.finalized,
            }
          : null,
      });
    }
  );

  // ==========================================================================
  // Treasury
  // ==========================================================================

  fastify.get("/api/governance/treasury", async () => {
    const address = getTreasuryAddress();
    const escrowStates = await Promise.all(
      governanceStore.bounties
        .filter(b => b.status === "escrowed")
        .map(async b => {
          const state = await getEscrowState(b.id);
          return { bountyId: b.id, title: b.title, amountWei: b.amountWei, escrowState: state };
        })
    );

    return {
      treasuryAddress: address,
      activeBounties: escrowStates.length,
      totalEscrowedWei: escrowStates
        .reduce((sum, b) => sum + BigInt(b.amountWei), 0n)
        .toString(),
      escrowedBounties: escrowStates,
    };
  });
}
