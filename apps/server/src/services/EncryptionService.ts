/**
 * MemoryEncryptionService
 *
 * Provides AES-256-GCM envelope encryption for agent memory descriptions.
 *
 * ## Encryption scheme
 *
 *   encrypted_value = "ENCRYPTED:{keyVersion}:{base64(iv[12] || authTag[16] || ciphertext)}"
 *
 * base64 uses the standard alphabet (no colons), so splitting on ':' is safe.
 * Legacy unencrypted descriptions pass through unchanged — no migration required.
 *
 * ## Key management modes
 *
 * **Local mode** (default when Azure is not configured):
 *   Set `MEMORY_ENCRYPTION_KEY` to a 32-byte base64-encoded key.
 *   Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 *
 * **Azure Key Vault mode** (production):
 *   Set `AZURE_KEY_VAULT_URI`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.
 *   Optionally set `AZURE_KEY_VAULT_KEY_NAME` (default: "agentcolony-memory-key").
 *   Data Encryption Keys (DEKs) are stored as Azure KV secrets keyed by version.
 *   Key rotation: `POST /api/admin/encryption/rotate` — creates a new DEK secret in Azure KV
 *   and activates it. Existing records retain their version tag and decrypt with the old key.
 *
 * ## Transparency
 *   `store.addMemory()` fires encryption in the background.
 *   `store.getAgentMemories()` decrypts descriptions transparently on read.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENCRYPTED_PREFIX = "ENCRYPTED:";

export interface EncryptionStatus {
  enabled: boolean;
  mode: "local" | "azure" | "disabled";
  activeKeyVersion: string;
  cachedVersions: string[];
  azureKeyName: string | null;
}

interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
}

export class MemoryEncryptionService {
  /** version → raw 32-byte AES key */
  private keyCache = new Map<string, Buffer>();
  private activeKeyVersion = "v1";
  /** Optional injected key (bypasses env vars — for testing) */
  private injectedKey: Buffer | null = null;

  private azureToken: string | null = null;
  private azureTokenExpiresAt = 0;

  /**
   * @param key Optional 32-byte key — provided directly (for testing). When set,
   *   forces local mode regardless of env vars.
   */
  constructor(key?: Buffer) {
    if (key) {
      if (key.length !== 32) throw new Error("Key must be exactly 32 bytes");
      this.injectedKey = key;
      this.keyCache.set("v1", key);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get isEnabled(): boolean {
    return !!(this.injectedKey || process.env.MEMORY_ENCRYPTION_KEY || process.env.AZURE_KEY_VAULT_URI);
  }

  get mode(): "local" | "azure" | "disabled" {
    if (this.injectedKey) return "local";
    if (process.env.AZURE_KEY_VAULT_URI) return "azure";
    if (process.env.MEMORY_ENCRYPTION_KEY) return "local";
    return "disabled";
  }

  status(): EncryptionStatus {
    return {
      enabled: this.isEnabled,
      mode: this.mode,
      activeKeyVersion: this.activeKeyVersion,
      cachedVersions: [...this.keyCache.keys()],
      azureKeyName: process.env.AZURE_KEY_VAULT_KEY_NAME ?? null,
    };
  }

  /** Encrypt a string. Returns original if encryption is disabled. */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.isEnabled) return plaintext;
    const key = await this.resolveKey(this.activeKeyVersion);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag(); // always 16 bytes
    const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
    return `${ENCRYPTED_PREFIX}${this.activeKeyVersion}:${payload}`;
  }

  /** Decrypt a value. Unencrypted (legacy) values pass through unchanged. */
  async decrypt(value: string): Promise<string> {
    if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
    const rest = value.slice(ENCRYPTED_PREFIX.length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx < 0) return value; // malformed
    const keyVersion = rest.slice(0, colonIdx);
    const payload = rest.slice(colonIdx + 1);
    try {
      const key = await this.resolveKey(keyVersion);
      const buf = Buffer.from(payload, "base64");
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ciphertext = buf.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(ciphertext) + decipher.final("utf8");
    } catch {
      return "[memory decryption failed]";
    }
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
  }

  /**
   * Rotate the active key. New memories use the new version; old ones still decrypt.
   * For Azure KV: generates a new DEK and stores it as a KV secret.
   * For local: generates an ephemeral key (persists until server restart — update env var for durability).
   */
  async rotateKey(): Promise<{ newKeyVersion: string }> {
    if (this.mode === "azure") return this.rotateAzureKey();
    const newVersion = `v${Date.now()}`;
    this.keyCache.set(newVersion, randomBytes(32));
    this.activeKeyVersion = newVersion;
    return { newKeyVersion: newVersion };
  }

  // ── Private: key resolution ───────────────────────────────────────────────

  private async resolveKey(version: string): Promise<Buffer> {
    const cached = this.keyCache.get(version);
    if (cached) return cached;

    if (this.mode === "azure") {
      const key = await this.fetchAzureKey(version);
      this.keyCache.set(version, key);
      return key;
    }

    // Local mode: prefer injected key over env var
    if (this.injectedKey) {
      this.keyCache.set(version, this.injectedKey);
      return this.injectedKey;
    }
    const rawKey = process.env.MEMORY_ENCRYPTION_KEY;
    if (!rawKey) throw new Error("MEMORY_ENCRYPTION_KEY not set");
    const key = Buffer.from(rawKey, "base64");
    if (key.length !== 32) throw new Error("MEMORY_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)");
    this.keyCache.set(version, key);
    return key;
  }

  // ── Private: Azure Key Vault ──────────────────────────────────────────────

  private async getAzureToken(): Promise<string> {
    if (this.azureToken && Date.now() < this.azureTokenExpiresAt - 30_000) return this.azureToken;
    const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
    if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
      throw new Error("Azure KV credentials not set (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)");
    }
    const url = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      scope: "https://vault.azure.net/.default",
    });
    const res = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (!res.ok) throw new Error(`Azure auth failed: ${res.status}`);
    const data = await res.json() as AzureTokenResponse;
    this.azureToken = data.access_token;
    this.azureTokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.azureToken;
  }

  private kvUrl(path: string): string {
    return `${(process.env.AZURE_KEY_VAULT_URI ?? "").replace(/\/$/, "")}${path}?api-version=7.4`;
  }

  /**
   * DEKs are stored as Azure KV secrets named "agentcolony-dek-{version}".
   * The secret value is the 32-byte DEK encoded as base64.
   */
  private async fetchAzureKey(version: string): Promise<Buffer> {
    const token = await this.getAzureToken();
    const res = await fetch(this.kvUrl(`/secrets/agentcolony-dek-${version}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Azure KV secret fetch failed (version ${version}): ${res.status}`);
    const data = await res.json() as { value: string };
    return Buffer.from(data.value, "base64");
  }

  private async rotateAzureKey(): Promise<{ newKeyVersion: string }> {
    const token = await this.getAzureToken();
    const newVersion = `v${Date.now()}`;
    const newDek = randomBytes(32);
    const res = await fetch(this.kvUrl(`/secrets/agentcolony-dek-${newVersion}`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value: newDek.toString("base64"), attributes: { enabled: true } }),
    });
    if (!res.ok) throw new Error(`Azure KV secret creation failed: ${res.status}`);
    this.keyCache.set(newVersion, newDek);
    this.activeKeyVersion = newVersion;
    return { newKeyVersion: newVersion };
  }
}

export const memoryEncryption = new MemoryEncryptionService();
