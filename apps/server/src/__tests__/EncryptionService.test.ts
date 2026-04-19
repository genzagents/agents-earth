/**
 * Tests for EncryptionService AES-256-GCM memory encryption.
 *
 * Uses Node.js built-in test runner (no Jest dependency).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";

// ------------------------------------------------------------------
// Helpers — dynamically import EncryptionService so we can control
// the env var before the singleton is constructed.
// ------------------------------------------------------------------

async function loadService(encKey?: string): Promise<{ memoryEncryption: { isEnabled: boolean; encrypt: (p: string) => Promise<string>; decrypt: (c: string) => Promise<string>; status: () => object; rotateKey: () => { success: boolean; activeVersion: string | null } } }> {
  if (encKey !== undefined) {
    process.env.MEMORY_ENCRYPTION_KEY = encKey;
  } else {
    delete process.env.MEMORY_ENCRYPTION_KEY;
  }
  // Use a fresh module instance by deleting the require cache entry
  const path = require.resolve("../services/EncryptionService");
  delete require.cache[path];
  return require("../services/EncryptionService") as ReturnType<typeof loadService> extends Promise<infer T> ? T : never;
}

// ------------------------------------------------------------------
// Tests — enabled mode
// ------------------------------------------------------------------

describe("MemoryEncryptionService — enabled", () => {
  const testKey = randomBytes(32).toString("base64");
  let svc: Awaited<ReturnType<typeof loadService>>;

  before(async () => {
    svc = await loadService(testKey);
  });

  after(() => {
    delete process.env.MEMORY_ENCRYPTION_KEY;
  });

  test("isEnabled is true when MEMORY_ENCRYPTION_KEY is set", () => {
    assert.equal(svc.memoryEncryption.isEnabled, true);
  });

  test("encrypt produces ENCRYPTED prefix", async () => {
    const enc = await svc.memoryEncryption.encrypt("hello world");
    assert.match(enc, /^ENCRYPTED:v1:/);
  });

  test("encrypt + decrypt roundtrip", async () => {
    const plaintext = "Ada remembers the afternoon light in Hyde Park.";
    const encrypted = await svc.memoryEncryption.encrypt(plaintext);
    const decrypted = await svc.memoryEncryption.decrypt(encrypted);
    assert.equal(decrypted, plaintext);
  });

  test("same plaintext produces different ciphertexts (random IV)", async () => {
    const msg = "Same message encrypted twice.";
    const enc1 = await svc.memoryEncryption.encrypt(msg);
    const enc2 = await svc.memoryEncryption.encrypt(msg);
    assert.notEqual(enc1, enc2);
  });

  test("decrypt returns plaintext unchanged when no ENCRYPTED prefix", async () => {
    const plain = "Not encrypted at all.";
    assert.equal(await svc.memoryEncryption.decrypt(plain), plain);
  });

  test("decrypt returns raw ciphertext for unknown key version", async () => {
    const fake = "ENCRYPTED:v99:dGVzdA==";
    assert.equal(await svc.memoryEncryption.decrypt(fake), fake);
  });

  test("status returns expected shape", () => {
    const s = svc.memoryEncryption.status() as Record<string, unknown>;
    assert.equal(s.enabled, true);
    assert.equal(s.activeVersion, "v1");
    assert.ok(Array.isArray(s.keyVersions));
  });
});

// ------------------------------------------------------------------
// Tests — disabled mode
// ------------------------------------------------------------------

describe("MemoryEncryptionService — disabled", () => {
  let svc: Awaited<ReturnType<typeof loadService>>;

  before(async () => {
    svc = await loadService(undefined);
  });

  after(() => {
    delete process.env.MEMORY_ENCRYPTION_KEY;
  });

  test("isEnabled is false when MEMORY_ENCRYPTION_KEY is not set", () => {
    assert.equal(svc.memoryEncryption.isEnabled, false);
  });

  test("encrypt returns plaintext unchanged", async () => {
    assert.equal(await svc.memoryEncryption.encrypt("hello"), "hello");
  });

  test("decrypt returns plaintext unchanged", async () => {
    assert.equal(await svc.memoryEncryption.decrypt("hello"), "hello");
  });
});
