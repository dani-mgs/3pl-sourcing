import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which vitest doesn't
// pick up on its own. Without this, any test file that transitively imports
// a module using the "@/" alias fails to resolve under vitest even though it
// builds fine in Next.js.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
