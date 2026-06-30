import { defineExperiment, claudeCodeAgent } from "fasteval";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

// 在沙箱 setup 时把本地 skill 写入 CLAUDE.md，让 claude CLI 自动读取。
// 这模拟了团队把内部最佳实践打包成 skill 分发给所有 coding agent 的场景。
const zodSkill = readFileSync(join(__dir, "../skills/zod.md"), "utf-8");

// 实验组：注入了 zod skill 的 Claude Code。
// 期望：Zod API 使用正确率显著高于对照组（baseline）。
export default defineExperiment({
  description: "claude-code + zod skill（本地注入）",
  agent: claudeCodeAgent(),
  model: "claude-sonnet-4-6",
  sandbox: "docker",
  runs: 3,
  earlyExit: false,
  budget: 10,

  // 只跑 Zod 相关 eval（排除 ponytail 系列）
  evals: (id) => !id.startsWith("ponytail-"),

  hooks: {
    sandbox: {
      // setup 在每次 eval run 前执行：将 skill 内容写入工作区根的 CLAUDE.md。
      // claude CLI 启动时自动读取工作区 CLAUDE.md，skill 内容即进入上下文。
      setup: async (sb) => {
        await sb.writeFiles({ "CLAUDE.md": zodSkill });
      },
    },
  },
});
