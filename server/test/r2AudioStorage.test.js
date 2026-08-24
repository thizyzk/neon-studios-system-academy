import assert from "node:assert/strict";
import test from "node:test";

import { createR2AudioStorage, matchesAudioSignature, normalizeAudioType, validateAudioUpload } from "../src/r2AudioStorage.js";
import { createTutorAudioStore } from "../src/tutorAudioStore.js";

const limits = { maxBytes: 3 * 1024 * 1024, maxDurationMs: 60_000 };

test("audio upload validation normalizes browser codecs and enforces limits", () => {
  assert.equal(normalizeAudioType("audio/webm;codecs=opus"), "audio/webm");
  assert.deepEqual(
    validateAudioUpload({ contentType: "audio/webm;codecs=opus", sizeBytes: 4096, durationMs: 1200 }, limits),
    { contentType: "audio/webm", sizeBytes: 4096, durationMs: 1200 }
  );
  assert.throws(
    () => validateAudioUpload({ contentType: "text/html", sizeBytes: 4096, durationMs: 1200 }, limits),
    (error) => error.statusCode === 415
  );
  assert.throws(
    () => validateAudioUpload({ contentType: "audio/webm", sizeBytes: limits.maxBytes + 1, durationMs: 1200 }, limits),
    (error) => error.statusCode === 413
  );
});

test("audio signatures reject mislabeled uploads", () => {
  assert.equal(matchesAudioSignature("audio/webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(matchesAudioSignature("audio/ogg", new TextEncoder().encode("OggS")), true);
  assert.equal(matchesAudioSignature("audio/mpeg", new TextEncoder().encode("ID3data")), true);
  assert.equal(matchesAudioSignature("audio/webm", new TextEncoder().encode("<html>")), false);
});

test("R2 object keys hide the Google subject and presigned uploads avoid empty checksums", async () => {
  const storage = createR2AudioStorage({
    r2AccountId: "account",
    r2AccessKeyId: "access",
    r2SecretAccessKey: "secret",
    r2BucketName: "audio",
    r2SignedUrlTtlSeconds: 300,
  });
  const identity = storage.createObjectIdentity({ sub: "google-user-123" }, "audio/webm");
  assert.equal(storage.available, true);
  assert.match(identity.audioId, /^[0-9a-f-]{36}$/i);
  assert.match(identity.objectKey, /^tutor-audio\/[0-9a-f]{24}\/[0-9]{4}-[0-9]{2}-[0-9]{2}\//);
  assert.equal(identity.objectKey.includes("google-user-123"), false);
  const uploadUrl = await storage.createUploadUrl(identity.objectKey, "audio/webm");
  assert.equal(uploadUrl.includes("x-amz-checksum"), false);
  storage.close();
});

test("audio services fail closed without R2 or PostgreSQL", async () => {
  const storage = createR2AudioStorage({});
  const store = createTutorAudioStore("");
  assert.equal(storage.available, false);
  assert.equal(store.available, false);
  assert.equal(await store.get({ sub: "user" }, "id"), null);
  await store.close();
});
