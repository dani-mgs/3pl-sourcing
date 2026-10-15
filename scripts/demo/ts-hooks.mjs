// Lets plain Node (22.18+, which strips TypeScript types itself) import the
// app's own TypeScript from src/, so the live demo script runs the same
// parsers, builders and guards as the app. Maps "@/..." to src/ and adds the
// ".ts" extension Next's bundler would. No dependency, no build step.
// Needs Node 22.18 or later (the repo's .nvmrc: run `nvm use` first).
//
//   node --import ./scripts/demo/ts-hooks.mjs scripts/demo/live-demo.mjs

import * as nodeModule from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18) || typeof nodeModule.registerHooks !== "function") {
  console.error(`demo: needs Node 22.18 or later (this is ${process.versions.node}). Run \`nvm use\` first.`);
  process.exit(1);
}

const SRC = path.resolve(import.meta.dirname, "../../src");

nodeModule.registerHooks({
  resolve(specifier, context, next) {
    let target = specifier;
    if (target.startsWith("@/")) target = pathToFileURL(path.join(SRC, target.slice(2))).href;
    else if ((target.startsWith("./") || target.startsWith("../")) && context.parentURL?.startsWith(pathToFileURL(SRC).href)) {
      target = new URL(target, context.parentURL).href;
    }
    if (target.startsWith("file:") && !path.extname(fileURLToPath(target))) {
      const file = fileURLToPath(target);
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(file + ext)) return next(pathToFileURL(file + ext).href, context);
      }
    }
    // Next's own entry points ("next/headers") are CommonJS files that ESM
    // only finds with their extension. Importing them is harmless here: the
    // script never calls cookies() or headers().
    if (/^next\/[a-z-]+$/.test(target)) return next(`${target}.js`, context);
    return next(target, context);
  },
});
