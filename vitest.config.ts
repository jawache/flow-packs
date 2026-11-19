import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["packs/**/*.test.ts", "tests/**/*.test.ts"] } });
