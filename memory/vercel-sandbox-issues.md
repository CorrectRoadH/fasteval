# Vercel Sandbox 已知问题

## session 寿命约 360-390s

**现象**：eval 跑到 360-390s 时出现 `StreamError: Stream ended before command finished` 或 `TypeError: terminated`。

**根因**：Vercel 免费计划有 session 硬上限。`extendTimeout` 返回 HTTP 400，`snapshot()` 返回 HTTP 402，均不支持续期。并发跑多个 eval 时，多路 LLM API 同时竞争，每个 agent 耗时被拉长到 280-400s，逼近上限。

**修法**（两者都需要）：
1. 实验配置里加 `maxConcurrency: 1` 串行跑，把每个 agent 耗时压到 50-200s
2. `VercelSandbox.readSourceFiles` 改两阶段：`find`-only shell（约 1s）+ 并行 `readFileToBuffer` HTTP GET（约 2s），避免 30s 的 NDJSON 流在 session 快到期时 StreamError

注意：`SESSION_TIMEOUT_MS` 必须是固定常量（1_200_000），不能从 `commandTimeoutMs` 推导——透传给 Vercel API 的 `timeout` 越大，实际拿到的 session 反而更短。

已修复：`src/sandbox/vercel.ts`（2026-06-29）

## ExperimentDef 的 maxConcurrency 字段曾无效

**现象**：实验文件里写 `maxConcurrency: 1` 不起作用，仍以默认并发 4 跑。

**根因**：`ExperimentDef` 类型里没有 `maxConcurrency` 字段，CLI 只读全局 `config.maxConcurrency`，实验级别的值被 TypeScript 静默忽略。

**修法**：在 `src/types.ts` 的 `ExperimentDef` 里加 `maxConcurrency?: number`，在 `src/cli.ts` 的 `exp` 命令里取所有选中实验的 `Math.min(...maxConcurrency)` 作为实际并发上限。

已修复：`src/types.ts` + `src/cli.ts`（2026-06-30）
