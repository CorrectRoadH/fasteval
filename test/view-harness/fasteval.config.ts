import { defineConfig } from "fasteval";

// view 的端到端验证夹具:全程不联网、不起沙箱(mock 进程内 agent + 本机 mock judge)。
// judge 的 baseUrl / key 由 run.mjs 经 FASTEVAL_JUDGE_BASE / FASTEVAL_JUDGE_KEY 注入。
export default defineConfig({
  judge: { model: "mock-judge" },
  timeoutMs: 30_000,
  maxConcurrency: 4,
});
