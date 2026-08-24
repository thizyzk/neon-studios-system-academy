import crypto from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AUDIO_TYPES = new Map([
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/wav", "wav"],
]);

export function normalizeAudioType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

export function matchesAudioSignature(contentType, bytes) {
  const type = normalizeAudioType(contentType);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (type === "audio/webm") return data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
  if (type === "audio/ogg") return data.length >= 4 && String.fromCharCode(...data.slice(0, 4)) === "OggS";
  if (type === "audio/wav") return data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WAVE";
  if (type === "audio/mp4") return data.length >= 8 && String.fromCharCode(...data.slice(4, 8)) === "ftyp";
  if (type === "audio/mpeg") {
    const id3 = data.length >= 3 && String.fromCharCode(...data.slice(0, 3)) === "ID3";
    const frameSync = data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0;
    return id3 || frameSync;
  }
  return false;
}

export function validateAudioUpload(input, limits) {
  const contentType = normalizeAudioType(input?.contentType);
  const sizeBytes = Number(input?.sizeBytes);
  const durationMs = Number(input?.durationMs);
  if (!AUDIO_TYPES.has(contentType)) {
    const error = new Error("Unsupported audio type.");
    error.statusCode = 415;
    throw error;
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 256 || sizeBytes > limits.maxBytes) {
    const error = new Error("Audio size is outside the allowed range.");
    error.statusCode = 413;
    throw error;
  }
  if (!Number.isInteger(durationMs) || durationMs < 250 || durationMs > limits.maxDurationMs) {
    const error = new Error("Audio duration is outside the allowed range.");
    error.statusCode = 400;
    throw error;
  }
  return { contentType, sizeBytes, durationMs };
}

export function createR2AudioStorage(config) {
  const available = Boolean(
    config.r2AccountId
    && config.r2AccessKeyId
    && config.r2SecretAccessKey
    && config.r2BucketName
  );
  if (!available) {
    return {
      available: false,
      endpointOrigin: "",
      createObjectIdentity() { return null; },
      async createUploadUrl() { return null; },
      async headObject() { return null; },
      async createReadUrl() { return null; },
      async deleteObject() {},
      close() {},
    };
  }

  const endpointOrigin = `https://${config.r2AccountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    endpoint: endpointOrigin,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });

  return {
    available: true,
    endpointOrigin,

    createObjectIdentity(user, contentType) {
      const audioId = crypto.randomUUID();
      const ownerHash = crypto.createHash("sha256").update(user.sub).digest("hex").slice(0, 24);
      const date = new Date().toISOString().slice(0, 10);
      const extension = AUDIO_TYPES.get(normalizeAudioType(contentType));
      return { audioId, objectKey: `tutor-audio/${ownerHash}/${date}/${audioId}.${extension}` };
    },

    async createUploadUrl(objectKey, contentType) {
      return getSignedUrl(client, new PutObjectCommand({
        Bucket: config.r2BucketName,
        Key: objectKey,
        ContentType: normalizeAudioType(contentType),
      }), { expiresIn: config.r2SignedUrlTtlSeconds });
    },

    async headObject(objectKey) {
      const result = await client.send(new HeadObjectCommand({ Bucket: config.r2BucketName, Key: objectKey }));
      const contentType = normalizeAudioType(result.ContentType);
      const sample = await client.send(new GetObjectCommand({
        Bucket: config.r2BucketName,
        Key: objectKey,
        Range: "bytes=0-31",
      }));
      const bytes = await sample.Body.transformToByteArray();
      if (!matchesAudioSignature(contentType, bytes)) {
        const error = new Error("Uploaded bytes are not a supported audio container.");
        error.statusCode = 415;
        throw error;
      }
      return {
        sizeBytes: Number(result.ContentLength || 0),
        contentType,
      };
    },

    async createReadUrl(objectKey) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.r2BucketName, Key: objectKey }), {
        expiresIn: config.r2SignedUrlTtlSeconds,
      });
    },

    async deleteObject(objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: config.r2BucketName, Key: objectKey }));
    },

    close() {
      client.destroy();
    },
  };
}
