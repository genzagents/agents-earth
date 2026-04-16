/**
 * Ingestion pipeline: raw connector output → OwnedAgent + MemoryStore.
 *
 * Steps:
 * 1. Run connector.extractAgents()
 * 2. Dedup against existing agents (system prompt similarity)
 * 3. For new agents: createAgent in DB
 * 4. For each agent: connector.extractMemory() → write episodes
 * 5. Run LLM memory extraction (Claude Sonnet) → seed semantic facts
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAgent, findAgentsByUser, type OwnedAgent } from "../db/ownedAgentStore";
import { writeEpisode, upsertSemanticFact } from "../memory/MemoryService";
import { connectorRegistry, type ConnectorConfig } from "./ConnectorRegistry";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface IngestionResult {
  imported: number;
  skipped: number;
  agents: Array<{
    id: string;
    name: string;
    isNew: boolean;
    episodesWritten: number;
    factsExtracted: number;
  }>;
}

function computeSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const aNorm = a.toLowerCase().replace(/\s+/g, " ").trim();
  const bNorm = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (aNorm === bNorm) return 1;
  // Simple Jaccard on trigrams
  const trigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const aSet = trigrams(aNorm);
  const bSet = trigrams(bNorm);
  let intersection = 0;
  for (const t of aSet) if (bSet.has(t)) intersection++;
  return intersection / (aSet.size + bSet.size - intersection || 1);
}

const DEDUP_THRESHOLD = 0.85;

export async function runIngestion(params: {
  sourceType: string;
  config: ConnectorConfig;
  userId: string;
}): Promise<IngestionResult> {
  const { sourceType, config, userId } = params;

  const connector = connectorRegistry.get(sourceType);
  if (!connector) throw new Error(`Unknown source type: ${sourceType}`);

  await connector.connect(config);

  const extractedAgents = await connector.extractAgents();
  const existingAgents = await findAgentsByUser(userId);

  const result: IngestionResult = { imported: 0, skipped: 0, agents: [] };

  for (const extracted of extractedAgents) {
    // Dedup: check if an existing agent has a very similar system prompt
    const duplicate = existingAgents.find(
      (ea: OwnedAgent) =>
        computeSimilarity(ea.systemPrompt, extracted.systemPrompt) >= DEDUP_THRESHOLD
    );

    let agent: OwnedAgent;
    let isNew = false;

    if (duplicate) {
      agent = duplicate;
      result.skipped++;
    } else {
      agent = await createAgent({
        userId,
        name: extracted.name,
        description: extracted.description,
        systemPrompt: extracted.systemPrompt,
        model: extracted.model ?? "claude-sonnet-4-6",
        avatarColor: extracted.avatarColor,
        sourceType,
      });
      existingAgents.push(agent);
      isNew = true;
      result.imported++;
    }

    // Extract memory from the source
    const memory = await connector.extractMemory(extracted.sourceId ?? extracted.name);
    let episodesWritten = 0;
    let factsExtracted = 0;

    for (const conv of memory.conversations) {
      if (conv.messages.length === 0) continue;

      // Run LLM extraction to get summary + semantic facts
      let summary = "Imported conversation";
      const facts: Array<{ key: string; value: string }> = [];

      try {
        const resp = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system:
            "Analyse this conversation and return a JSON object with:\n" +
            '- "summary": 1-2 sentence description of what was discussed\n' +
            '- "facts": array of {"key": string, "value": string} notable preferences or patterns\n' +
            "Return only valid JSON.",
          messages: [
            {
              role: "user",
              content: conv.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
            },
          ],
        });

        const text = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        const parsed = JSON.parse(text) as { summary?: string; facts?: Array<{ key: string; value: string }> };
        summary = parsed.summary ?? summary;
        facts.push(...(parsed.facts ?? []));
      } catch {
        // LLM extraction failed; still write the raw episode
      }

      await writeEpisode({
        agentId: agent.id,
        userId,
        summary,
        messages: conv.messages,
        tags: facts.map((f) => f.key),
      });
      episodesWritten++;

      for (const fact of facts) {
        await upsertSemanticFact({ agentId: agent.id, userId, key: fact.key, value: fact.value });
        factsExtracted++;
      }
    }

    result.agents.push({ id: agent.id, name: agent.name, isNew, episodesWritten, factsExtracted });
  }

  return result;
}
