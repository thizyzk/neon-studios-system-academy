import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { readConfig } from "../src/config.js";

const PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search";
const DEFAULT_QUERY = "nature ambience forest river";
const DEFAULT_COUNT = 5;
const DEFAULT_ORIENTATION = "landscape";
const MAX_VIDEO_WIDTH = 1280;

function parseArgs(argv) {
  const args = {
    query: DEFAULT_QUERY,
    count: DEFAULT_COUNT,
    orientation: DEFAULT_ORIENTATION,
    outDir: path.resolve(process.cwd(), "..", "assets", "ambient-videos"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--query" && next) {
      args.query = next;
      index += 1;
    } else if (arg === "--count" && next) {
      args.count = Math.max(1, Math.min(20, Number.parseInt(next, 10) || DEFAULT_COUNT));
      index += 1;
    } else if (arg === "--orientation" && next) {
      args.orientation = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return args;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function requestPexelsVideos(apiKey, options) {
  const url = new URL(PEXELS_VIDEO_SEARCH_URL);
  url.searchParams.set("query", options.query);
  url.searchParams.set("per_page", String(options.count));
  url.searchParams.set("orientation", options.orientation);

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Pexels request failed with ${response.status}`);
  }

  return payload.videos ?? [];
}

function pickVideoFile(video) {
  const candidates = (video.video_files ?? [])
    .filter((file) => file.file_type === "video/mp4" && file.link)
    .sort((a, b) => {
      const aWidth = a.width ?? Number.MAX_SAFE_INTEGER;
      const bWidth = b.width ?? Number.MAX_SAFE_INTEGER;
      const aDistance = Math.abs(Math.min(aWidth, MAX_VIDEO_WIDTH) - MAX_VIDEO_WIDTH);
      const bDistance = Math.abs(Math.min(bWidth, MAX_VIDEO_WIDTH) - MAX_VIDEO_WIDTH);
      return aDistance - bDistance;
    });

  return candidates.find((file) => (file.width ?? 0) <= MAX_VIDEO_WIDTH) ?? candidates[0] ?? null;
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }

  await pipeline(response.body, createWriteStream(destination));
}

async function main() {
  readConfig();
  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing PEXELS_API_KEY in server/.env");
  }

  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outDir, { recursive: true });

  const videos = await requestPexelsVideos(apiKey, options);
  const manifest = [];

  for (const [index, video] of videos.entries()) {
    const file = pickVideoFile(video);
    if (!file) {
      continue;
    }

    const filename = `${String(index + 1).padStart(2, "0")}-${slugify(options.query)}-${video.id}.mp4`;
    const destination = path.join(options.outDir, filename);

    console.log(`Downloading ${filename}`);
    await downloadFile(file.link, destination);

    manifest.push({
      source: "pexels",
      id: video.id,
      title: options.query,
      url: video.url,
      photographer: video.user?.name ?? "",
      photographerUrl: video.user?.url ?? "",
      width: file.width,
      height: file.height,
      duration: video.duration,
      localFile: filename,
    });
  }

  const manifestPath = path.join(options.outDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify({
    query: options.query,
    downloadedAt: new Date().toISOString(),
    videos: manifest,
  }, null, 2)}\n`, "utf8");

  console.log(`Saved ${manifest.length} video(s) to ${options.outDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
