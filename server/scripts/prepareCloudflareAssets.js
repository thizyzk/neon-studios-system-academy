import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(serverRoot, "..");
const outputRoot = path.resolve(projectRoot, ".cloudflare", "assets");

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
await Promise.all([
  fs.cp(path.resolve(projectRoot, "docs", "economy-systems-guide"), outputRoot, { recursive: true }),
  fs.cp(path.resolve(projectRoot, "src"), path.resolve(outputRoot, "src"), { recursive: true }),
]);

console.log(`Cloudflare assets prepared at ${outputRoot}`);
