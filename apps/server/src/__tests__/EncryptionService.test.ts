import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { MemoryEncryptionService } from "../services/EncryptionService";

// Each test suite creates its own service instance to avoid shared state issues
function makeService(key?: string): MemoryEncryptionService {
  const svc = new MemoryEncryptionService();
  if (key !== undefined) {
    (svc as unknown as { _testKey: string })["_testKey"] = key;
  }
  return svc;
}

// Helper: create service with a 32-byte local key via env var
function makeLocalService(): MemoryEncryptionService {
  return new MemoryEncryptionService(randomBytes(32));
}

describe("MemoryEncryptionService — local mode", () => {
  test("encrypt/decrypt round-trip", async () => {
    const svc = makeLocalService();
    const plain = "Ada remembers the smell of old paper";
    const enc = await svc.encrypt(plain);
    const dec = await svc.decrypt(enc);
    assert.equal(dec, plain);
  });

  test("encrypted value has ENCRYPTED: prefix", async () => {
    const svc = makeLocalService();
    const enc = await svc.encrypt("hello");
    assert.ok(enc.startsWith("ENCRYPTED:"), `expected ENCRYPTED: prefix, got: ${enc.slice(0, 20)}`);
  });

  test("two encryptions of same plaintext differ (random IV)", async () => {
    const svc = makeLocalService();
    const enc1 = await svc.encrypt("same");
    const enc2 = await svc.encrypt("same");
    assert.notEqual(enc1, enc2);
  });

  test("isEncrypted returns true for encrypted value", async () => {
    const svc = makeLocalService();
    const enc = await svc.encrypt("test");
    assert.equal(svc.isEncrypted(enc), true);
  });

  test("isEncrypted returns false for plaintext", () => {
    const svc = makeLocalService();
    assert.equal(svc.isEncrypted("hello world"), false);
  });

  test("decrypt passes through unencrypted legacy records", async () => {
    const svc = makeLocalService();
    const plain = "unencrypted legacy memory";
    assert.equal(await svc.decrypt(plain), plain);
  });

  test("decrypt returns safe placeholder for malformed ciphertext", async () => {
    const svc = makeLocalService();
    const malformed = "ENCRYPTED:v1:notvalidpayload@@##";
    const result = await svc.decrypt(malformed);
    assert.ok(typeof result === "string");
    // Should not throw — either decrypted or safe fallback
  });

  test("handles unicode content", async () => {
    const svc = makeLocalService();
    const plain = "日本語メモリ 🧠 — testing unicode";
    assert.equal(await svc.decrypt(await svc.encrypt(plain)), plain);
  });

  test("handles empty string", async () => {
    const svc = makeLocalService();
    assert.equal(await svc.decrypt(await svc.encrypt("")), "");
  });

  test("handles long content (>1KB)", async () => {
    const svc = makeLocalService();
    const plain = "x".repeat(2048);
    assert.equal(await svc.decrypt(await svc.encrypt(plain)), plain);
  });
});

describe("MemoryEncryptionService — status()", () => {
  test("returns correct structure for enabled service", () => {
    const svc = makeLocalService();
    const s = svc.status();
    assert.equal(s.enabled, true);
    assert.equal(s.mode, "local");
    assert.ok(typeof s.activeKeyVersion === "string");
    assert.ok(Array.isArray(s.cachedVersions));
    assert.equal(s.azureKeyName, null);
  });

  test("disabled when no key provided", () => {
    const svc = new MemoryEncryptionService();
    assert.equal(svc.isEnabled, false);
    assert.equal(svc.mode, "disabled");
  });
});

describe("MemoryEncryptionService — rotateKey()", () => {
  test("returns new key version string starting with v", async () => {
    const svc = makeLocalService();
    const result = await svc.rotateKey();
    assert.ok(typeof result.newKeyVersion === "string");
    assert.ok(result.newKeyVersion.startsWith("v"));
  });

  test("active key version changes after rotation", async () => {
    const svc = makeLocalService();
    const before = svc.status().activeKeyVersion;
    await svc.rotateKey();
    assert.notEqual(svc.status().activeKeyVersion, before);
  });

  test("memories from before rotation still decrypt after rotation", async () => {
    const svc = makeLocalService();
    const plain = "memory before rotation";
    const encBefore = await svc.encrypt(plain);
    await svc.rotateKey();
    assert.equal(await svc.decrypt(encBefore), plain);
  });

  test("new memories use new key version after rotation", async () => {
    const svc = makeLocalService();
    await svc.rotateKey();
    const newVersion = svc.status().activeKeyVersion;
    const enc = await svc.encrypt("post-rotation memory");
    assert.ok(enc.includes(`:${newVersion}:`), `expected new version in ciphertext: ${enc.slice(0, 40)}`);
  });
});
