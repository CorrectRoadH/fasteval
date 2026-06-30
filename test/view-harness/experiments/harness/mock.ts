import { defineExperiment } from "fasteval";
import { mockAgent } from "../../agents/mock.ts";

// 一个实验 = 一个配置:用 mock agent 跑全部 eval(各 1 次)。无沙箱、无网络。
export default defineExperiment({
  description: "view 端到端验证(mock agent)",
  agent: mockAgent(),
  model: "mock-1",
  runs: 1,
  earlyExit: false,
  evals: "*",
});
