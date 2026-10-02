// Official sources for the tariff seeds: where each comes from, when it was
// retrieved and its SHA-256, so a seed can be regenerated from exactly the
// files it was built from. Downloads live in .cache/tariff-sources/ (not
// committed); `npm run tariff:fetch` fills it and checks every hash.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const SOURCES_FILE = path.join(REPO_ROOT, "scripts/tariff/sources.json");
export const CACHE_DIR = path.join(REPO_ROOT, ".cache/tariff-sources");

export function loadSources() {
  return JSON.parse(readFileSync(SOURCES_FILE, "utf8"));
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function cachePath(source) {
  return path.join(CACHE_DIR, source.file);
}

// Downloads every source (or only `ids`). A source whose bytes differ from
// the recorded hash is reported, not silently accepted: the published text
// changed and the seed needs regenerating and re-review. With `update`, the
// new hash and today's date are written back to sources.json.
export async function fetchSources({ ids = null, update = false, log = console.log } = {}) {
  const manifest = loadSources();
  mkdirSync(CACHE_DIR, { recursive: true });
  const changed = [];
  for (const [id, source] of Object.entries(manifest.sources)) {
    if (ids && !ids.includes(id)) continue;
    const response = await fetch(source.url, { headers: { "User-Agent": "3pl-sourcing tariff seed scripts" } });
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status} from ${source.url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = sha256(bytes);
    writeFileSync(cachePath(source), bytes);
    if (hash === source.sha256) {
      log(`ok       ${id} (${bytes.length} bytes)`);
      continue;
    }
    changed.push(id);
    log(`CHANGED  ${id}: ${source.sha256 ?? "(no hash)"} -> ${hash}`);
    if (update) {
      source.sha256 = hash;
      source.bytes = bytes.length;
      source.retrieved_on = new Date().toISOString().slice(0, 10);
    }
  }
  if (update && changed.length > 0) writeFileSync(SOURCES_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return changed;
}

// The cached bytes of a source, checked against its recorded hash.
export function readSource(id) {
  const source = loadSources().sources[id];
  if (!source) throw new Error(`Unknown source ${id}`);
  const file = cachePath(source);
  if (!existsSync(file)) throw new Error(`${id} isn't downloaded yet: run npm run tariff:fetch`);
  const bytes = readFileSync(file);
  if (sha256(bytes) !== source.sha256) {
    throw new Error(`${id} doesn't match its recorded hash: the source changed (run npm run tariff:fetch -- --update and review)`);
  }
  return { source, bytes };
}
