import type { Memory } from "@agentcolony/shared";

interface PineconeMatch {
  id: string;
  score?: number;
}

interface PineconeQueryResponse {
  matches: PineconeMatch[];
}

interface OpenAIEmbedResponse {
  data: { embedding: number[] }[];
}

export class VectorMemoryService {
  private get indexHost(): string {
    if (process.env.PINECONE_INDEX_HOST) {
      return process.env.PINECONE_INDEX_HOST;
    }
    const index = process.env.PINECONE_INDEX ?? "";
    const env = process.env.PINECONE_ENV ?? "us-east1-gcp";
    return `https://${index}.svc.${env}.pinecone.io`;
  }

  get isEnabled(): boolean {
    return Boolean(process.env.PINECONE_API_KEY);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embed error: ${res.status}`);
    }

    const json = (await res.json()) as OpenAIEmbedResponse;
    return json.data[0].embedding;
  }

  async upsert(memory: Memory): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const vector = await this.getEmbedding(memory.description);
      const pineconeKey = process.env.PINECONE_API_KEY!;

      const res = await fetch(`${this.indexHost}/vectors/upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": pineconeKey,
        },
        body: JSON.stringify({
          vectors: [
            {
              id: memory.id,
              values: vector,
              metadata: {
                agentId: memory.agentId,
                description: memory.description,
                kind: memory.kind,
                createdAt: memory.createdAt,
              },
            },
          ],
          namespace: memory.agentId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Pinecone upsert error: ${res.status}`);
      }
    } catch {
      // No-op on error — graceful degradation
    }
  }

  async search(agentId: string, query: string, limit = 10): Promise<string[]> {
    if (!this.isEnabled) return [];

    try {
      const vector = await this.getEmbedding(query);
      const pineconeKey = process.env.PINECONE_API_KEY!;

      const res = await fetch(`${this.indexHost}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": pineconeKey,
        },
        body: JSON.stringify({
          vector,
          topK: limit,
          namespace: agentId,
          includeMetadata: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Pinecone query error: ${res.status}`);
      }

      const json = (await res.json()) as PineconeQueryResponse;
      return json.matches.map((m) => m.id);
    } catch {
      return [];
    }
  }
}

export const vectorMemory = new VectorMemoryService();
