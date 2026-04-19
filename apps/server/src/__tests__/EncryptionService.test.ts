/**
 * Tests for EncryptionService AES-256-GCM memory encryption.
 *
 * Uses Node.js built-in test runner (no Jest dependency).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { MemoryEncryptionService } from "../services/EncryptionService.ts";

// ------------------------------------------------------------------
// Tests — enabled mode
// ------------------------------------------------------------------

describe("MemoryEncryptionService — enabled", () => {
  const testKey = randomBytes(32).toString("base64");

  function makeSvc() {
    const orig = process.env.MEMORY_ENCRYPTION_KEY;
    process.env.MEMORY_ENCRYPTION_KEY = testKey;
    const svc = new MemoryEncryptionService();
    if (orig === undefined) {
      delete process.env.MEMORY_ENCRYPTION_KEY;
    } else {
      process.env.MEMORY_ENCRYPTION_KEY = orig;
    }
    return svc;
  }

  test("isEnabled is true when MEMORY_ENCRYPTION_KEY is set", () => {
    assert.equal(makeSvc().isEnabled, true);
  });

  test("encryptSync produces ENCRYPTED prefix", () => {
    const enc = makeSvc().encryptSync("hello world");
    assert.match(enc, /^ENCRYPTED:v1:/);
  });

  test("encryptSync + decryptSync roundtrip", () => {
    const svc = makeSvc();
    const plaintext = "Ada remembers the afternoon light in Hyde Park.";
    const encrypted = svc.encryptSync(plaintext);
    const decrypted = svc.decryptSync(encrypted);
    assert.equal(decrypted, plaintext);
  });

  test("same plaintext produces different ciphertexts (random IV)", () => {
    const svc = makeSvc();
    const msg = "Same message encrypted twice.";
    const enc1 = svc.encryptSync(msg);
    const enc2 = svc.encryptSync(msg);
    assert.notEqual(enc1, enc2);
  });

  test("decryptSync returns plaintext unchanged when no ENCRYPTED prefix", () => {
    const plain = "Not encrypted at all.";
    assert.equal(makeSvc().decryptSync(plain), plain);
  });

  test("decryptSync returns raw ciphertext for unknown key version", () => {
    const fake = "ENCRYPTED:v99:dGVzdA==";
    assert.equal(makeSvc().decryptSync(fake), fake);
  });

  test("status returns expected shape", () => {
    const s = makeSvc().status() as Record<string, unknown>;
    assert.equal(s.enabled, true);
    assert.equal(s.activeVersion, "v1");
    assert.ok(Array.isArray(s.keyVersions));
  });

  test("async encrypt/decrypt wrappers produce correct results", async () => {
    const svc = makeSvc();
    const plaintext = "Async wrapper compatibility check.";
    const encrypted = await svc.encrypt(plaintext);
    assert.match(encrypted, /^ENCRYPTED:v1:/);
    const decrypted = await svc.decrypt(encrypted);
    assert.equal(decrypted, plaintext);
  });
});

// ------------------------------------------------------------------
// Tests — disabled mode
// ------------------------------------------------------------------

describe("MemoryEncryptionService — disabled", () => {
  function makeSvc() {
    const orig = process.env.MEMORY_ENCRYPTION_KEY;
    delete process.env.MEMORY_ENCRYPTION_KEY;
    const svc = new MemoryEncryptionService();
    if (orig !== undefined) process.env.MEMORY_ENCRYPTION_KEY = orig;
    return svc;
  }

  test("isEnabled is false when MEMORY_ENCRYPTION_KEY is not set", () => {
    assert.equal(makeSvc().isEnabled, false);
  });

  test("encryptSync returns plaintext unchanged", () => {
    assert.equal(makeSvc().encryptSync("hello"), "hello");
  });

  test("decryptSync returns plaintext unchanged", () => {
    assert.equal(makeSvc().decryptSync("hello"), "hello");
  });
});
