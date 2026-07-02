// AI SDK(Vercel `ai` 包)结果 → 标准事件流的共享转换器(采集通道 0:进程内直构)。
//
// 结构化 typing,不依赖 `ai` 包:niceeval 只认识 generateText / streamText 完整结果的
// 【形状子集】。字段名跨 AI SDK 大版本漂移(v4 args/result/promptTokens、v5+ input/output/
// inputTokens)在这里统一兜住,adapter 作者不必各自写防御代码,也不必像手工 recorder 那样
// 包住每个工具的 execute —— AI SDK 的 steps 里本来就有带 toolCallId 的完整调用记录。

import type { JsonValue, StreamEvent, ToolName, Usage } from "../types.ts";

// ───────────────────────── AI SDK 结果的形状子集 ─────────────────────────

/** 一次工具调用(v5+ 用 `input`,v4 用 `args`;两者都认)。 */
export interface AiSdkToolCallLike {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  args?: unknown;
}

/** 一次工具结果(v5+ 用 `output`,v4 用 `result`)。 */
export interface AiSdkToolResultLike {
  toolCallId: string;
  toolName?: string;
  output?: unknown;
  result?: unknown;
}

/**
 * step.content 的一个 part(v5+)。带类型序:同一 step 里 reasoning / text / tool-call /
 * tool-result / tool-error 按真实发生顺序排 —— 有它就优先用它,时序保真。
 */
export interface AiSdkContentPartLike {
  type: string;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  args?: unknown;
  output?: unknown;
  result?: unknown;
  error?: unknown;
}

/** 一个 step = 一次模型调用(工具循环里的一圈)。 */
export interface AiSdkStepLike {
  content?: readonly AiSdkContentPartLike[];
  text?: string;
  reasoningText?: string;
  toolCalls?: readonly AiSdkToolCallLike[];
  toolResults?: readonly AiSdkToolResultLike[];
}

export interface AiSdkUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
}

/** generateText / streamText 完整结果的形状子集。没有 steps 的老结果退回顶层字段。 */
export interface AiSdkResultLike {
  text?: string;
  steps?: readonly AiSdkStepLike[];
  toolCalls?: readonly AiSdkToolCallLike[];
  toolResults?: readonly AiSdkToolResultLike[];
  /** v5+ 聚合全部 step 的用量;优先于 usage(usage 只是最后一个 step)。 */
  totalUsage?: AiSdkUsageLike;
  usage?: AiSdkUsageLike;
}

// ───────────────────────── 转换 ─────────────────────────

/**
 * AI SDK 结果 → `{ events, usage }`,直接铺进 `Turn` 返回:
 *
 * ```typescript
 * const result = await generateText({ model, tools, prompt: input.text });
 * return { ...fromAiSdk(result), data: result.text, status: "completed" };
 * ```
 *
 * `callId` 用 AI SDK 原生的 `toolCallId`(显式配对,不合成);工具名保留原名进 `name`,
 * canonical 名进 `tool`(认不出的域内工具落 "unknown",`calledTool("get_weather")`
 * 仍按原名匹配)。工具执行失败(v5+ 的 `tool-error` part)映射成 `status: "failed"` 的
 * `action.result`,喂 `noFailedActions()`。
 */
export function fromAiSdk(result: AiSdkResultLike): { events: StreamEvent[]; usage?: Usage } {
  const events: StreamEvent[] = [];
  const steps: readonly AiSdkStepLike[] =
    result.steps && result.steps.length > 0
      ? result.steps
      : [{ text: result.text, toolCalls: result.toolCalls, toolResults: result.toolResults }];

  for (const step of steps) {
    if (Array.isArray(step.content) && step.content.length > 0) {
      pushContentParts(events, step.content);
    } else {
      pushStepFields(events, step);
    }
  }

  return { events, usage: readUsage(result, steps.length) };
}

/** v5+ 路径:content parts 自带真实顺序,逐个翻译。 */
function pushContentParts(events: StreamEvent[], parts: readonly AiSdkContentPartLike[]): void {
  for (const part of parts) {
    switch (part.type) {
      case "text": {
        const text = str(part.text);
        if (text) events.push({ type: "message", role: "assistant", text });
        break;
      }
      case "reasoning": {
        const text = str(part.text);
        if (text) events.push({ type: "thinking", text });
        break;
      }
      case "tool-call": {
        const name = str(part.toolName) ?? "unknown";
        events.push({
          type: "action.called",
          callId: str(part.toolCallId) ?? "unknown",
          name,
          input: asJson(part.input ?? part.args),
          tool: normalizeToolName(name),
        });
        break;
      }
      case "tool-result":
        events.push({
          type: "action.result",
          callId: str(part.toolCallId) ?? "unknown",
          output: asJson(part.output ?? part.result),
          status: "completed",
        });
        break;
      case "tool-error":
        events.push({
          type: "action.result",
          callId: str(part.toolCallId) ?? "unknown",
          output: { error: part.error instanceof Error ? part.error.message : String(part.error) },
          status: "failed",
        });
        break;
      default:
        break; // source / file 等其余 part 类型对断言无意义,丢弃
    }
  }
}

/** 退路(v4 / 无 content parts):toolCalls + toolResults + text,顺序按「调用 → 结果 → 文本」近似。 */
function pushStepFields(events: StreamEvent[], step: AiSdkStepLike): void {
  if (step.reasoningText) events.push({ type: "thinking", text: step.reasoningText });
  for (const call of step.toolCalls ?? []) {
    events.push({
      type: "action.called",
      callId: call.toolCallId,
      name: call.toolName,
      input: asJson(call.input ?? call.args),
      tool: normalizeToolName(call.toolName),
    });
  }
  for (const res of step.toolResults ?? []) {
    events.push({
      type: "action.result",
      callId: res.toolCallId,
      output: asJson(res.output ?? res.result),
      status: "completed",
    });
  }
  if (step.text?.trim()) events.push({ type: "message", role: "assistant", text: step.text });
}

/** totalUsage(全 steps 聚合)优先;两套 token 命名都认;requests = step 数。 */
function readUsage(result: AiSdkResultLike, stepCount: number): Usage | undefined {
  const u = result.totalUsage ?? result.usage;
  if (!u) return undefined;
  const inputTokens = num(u.inputTokens) ?? num(u.promptTokens) ?? 0;
  const outputTokens = num(u.outputTokens) ?? num(u.completionTokens) ?? 0;
  if (inputTokens === 0 && outputTokens === 0) return undefined;
  const usage: Usage = { inputTokens, outputTokens, requests: Math.max(stepCount, 1) };
  const cached = num(u.cachedInputTokens);
  if (cached) usage.cacheReadTokens = cached;
  return usage;
}

/** AI SDK 应用的工具多为域内自定义名(get_weather…),canonical 落 "unknown" 即可;仅认通用别名。 */
function normalizeToolName(name: string): ToolName {
  const toolMap: Record<string, ToolName> = {
    read_file: "file_read",
    write_file: "file_write",
    create_file: "file_write",
    edit_file: "file_edit",
    bash: "shell",
    shell: "shell",
    execute_command: "shell",
    run_command: "shell",
    web_fetch: "web_fetch",
    fetch_url: "web_fetch",
    web_search: "web_search",
    glob: "glob",
    grep: "grep",
    list_dir: "list_dir",
  };
  return toolMap[name.toLowerCase()] ?? "unknown";
}

/** 工具入参 / 出参在 AI SDK 里经 schema 校验,本就是 JSON 值;这里只做形状断言。 */
function asJson(value: unknown): JsonValue {
  return (value ?? null) as JsonValue;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
