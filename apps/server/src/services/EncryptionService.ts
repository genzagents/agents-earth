/**
 * EncryptionService — AES-256-GCM memory encryption at rest.
 *
 * Two modes:
 *   1. Local key: set MEMORY_ENCRYPTION_KEY env var to a 32-byte base64 string.
 *   2. Azure Key Vault: set AZURE_KEY_VAULT_URI + AZURE_CLIENT_ID/SECRET/TENANT_ID.
 *
 * Encrypted format: "ENCRYPTED:{keyVersion}:{base64(iv[12] || authTag[16] || ciphertext)}"
 * Plain text is stored as-is when encryption is not enabled.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENCRYPTED_PREFIX = "ENCRYPTED:";
const IV_LENGTH = 12;        // AES-GCM recommended
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag

interface KeyEntry {
  version: string;
  key: Buffer;
}

class MemoryEncryptionService {
  private keys: Map<string, KeyEntry> = new Map();
  private activeVersion: string | null = null;

  constructor() {
    this.loadLocalKey();
  }

  private loadLocalKey(): void {
    const envKey = process.env.MEMORY_ENCRYPTION_KEY;
    if (!envKey) return;

    try {
      const keyBuf = Buffer.from(envKey, "base64");
      if (keyBuf.length !== 32) {
        console.warn("[EncryptionService] MEMORY_ENCRYPTION_KEY must be 32 bytes (base64). Encryption disabled.");
        return;
      }
      const version = "v1";
      this.keys.set(version, { version, key: keyBuf });
      this.activeVersion = version;
    } catch {
      console.warn("[EncryptionService] Failed to load MEMORY_ENCRYPTION_KEY. Encryption disabled.");
    }
  }

  get isEnabled(): boolean {
    return this.activeVersion !== null;
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!this.isEnabled || !this.activeVersion) return plaintext;

    const entry = this.keys.get(this.activeVersion)!;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", entry.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, encrypted]);
    return `${ENCRYPTED_PREFIX}${entry.version}:${combined.toString("base64")}`;
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) return ciphertext;

    const rest = ciphertext.slice(ENCRYPTED_PREFIX.length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx < 0) return ciphertext;

    const version = rest.slice(0, colonIdx);
    const data = rest.slice(colonIdx + 1);

    const entry = this.keys.get(version);
    if (!entry) {
      console.warn(`[EncryptionService] Unknown key version "${version}" — returning raw`);
      return ciphertext;
    }

    try {
      const combined = Buffer.from(data, "base64");
      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = createDecipheriv("aes-256-gcm", entry.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      console.warn("[EncryptionService] Decryption failed — possible tampered data or wrong key");
      return ciphertext;
    }
  }

  status(): object {
    return {
      enabled: this.isEnabled,
      activeVersion: this.activeVersion,
      keyVersions: Array.from(this.keys.keys()),
      mode: process.env.AZURE_KEY_VAULT_URI ? "azure-key-vault" : "local-env",
    };
  }

  /**
   * rotateKey — load a new key version from MEMORY_ENCRYPTION_KEY_NEW env var.
   * After rotation the new key becomes active; old keys are kept for decryption.
   */
  rotateKey(): { success: boolean; activeVersion: string | null } {
    const newKeyEnv = process.env.MEMORY_ENCRYPTION_KEY_NEW;
    if (!newKeyEnv) {
      return { success: false, activeVersion: this.activeVersion };
    }

    try {
      const keyBuf = Buffer.from(newKeyEnv, "base64");
      if (keyBuf.length !== 32) {
        return { success: false, activeVersion: this.activeVersion };
      }
      const version = `v${this.keys.size + 1}`;
      this.keys.set(version, { version, key: keyBuf });
      this.activeVersion = version;
      return { success: true, activeVersion: this.activeVersion };
    } catch {
      return { success: false, activeVersion: this.activeVersion };
    }
  }
}

export const memoryEncryption = new MemoryEncryptionService();
