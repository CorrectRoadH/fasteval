import { defineConfig } from "fasteval";

export default defineConfig({
  judge: { model: "gpt-4o-mini" },
  timeoutMs: 60_000,
  maxConcurrency: 4,
});
