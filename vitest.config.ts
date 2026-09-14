import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// A standalone config rather than `test` inside vite.config.ts: the app config
// loads the PWA plugin, which has nothing to do with unit tests. The only
// thing tests need from it is the `@` -> ./src path alias, mirrored below so
// test imports read exactly like app imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Every suite here covers a pure module, so `node` is the correct default.
    // A file that genuinely needs a DOM can opt in per file with a
    // `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // No implicit globals — each test file imports describe/it/expect from
    // "vitest", which keeps `tsc -b` happy without extra global type entries.
    globals: false,
  },
});
