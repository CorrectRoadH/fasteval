import { defineConfig } from "fasteval";

export default defineConfig({
  // Claude Code 需要隔离工作区，走 Docker 沙箱。
  sandbox: "docker",

  // 被测工作区：已装好 zod 和 express 的 TypeScript 项目。
  workspace: "./workspaces/ts-starter",

  // 评判模型：用轻量模型做 judge，与被测 agent 解耦。
  judge: { model: "claude-haiku-4-5-20251001" },

  timeoutMs: 180_000,  // 3 分钟：Docker 启动 + 编码任务通常在此范围内完成
  maxConcurrency: 2,   // 同时跑 2 个 eval；避免 Docker 资源争抢
});
