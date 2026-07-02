import { describe, expect, it } from "vitest";

import { fromAiSdk } from "./ai-sdk.ts";

describe("fromAiSdk", () => {
  it("v5+ content parts:保留真实顺序,tool-error 映射成 failed", () => {
    const { events } = fromAiSdk({
      steps: [
        {
          content: [
            { type: "reasoning", text: "先查天气" },
            { type: "tool-call", toolCallId: "call_1", toolName: "get_weather", input: { city: "Brooklyn" } },
            { type: "tool-result", toolCallId: "call_1", output: { temp: 21 } },
            { type: "tool-call", toolCallId: "call_2", toolName: "web_search", input: { query: "穿衣" } },
            { type: "tool-error", toolCallId: "call_2", error: new Error("rate limited") },
          ],
        },
        { content: [{ type: "text", text: "布鲁克林 21 度。" }] },
      ],
    });

    expect(events.map((e) => e.type)).toEqual([
      "thinking",
      "action.called",
      "action.result",
      "action.called",
      "action.result",
      "message",
    ]);
    expect(events[1]).toMatchObject({ callId: "call_1", name: "get_weather", tool: "unknown" });
    expect(events[3]).toMatchObject({ callId: "call_2", name: "web_search", tool: "web_search" });
    expect(events[4]).toMatchObject({ status: "failed", output: { error: "rate limited" } });
    expect(events[5]).toMatchObject({ role: "assistant", text: "布鲁克林 21 度。" });
  });

  it("v4 退路:认 args / result / promptTokens 旧命名", () => {
    const { events, usage } = fromAiSdk({
      steps: [
        {
          text: "算好了,是 42。",
          toolCalls: [{ toolCallId: "c1", toolName: "calculate", args: { expression: "6*7" } }],
          toolResults: [{ toolCallId: "c1", result: { value: 42 } }],
        },
      ],
      usage: { promptTokens: 100, completionTokens: 20 },
    });

    expect(events).toEqual([
      { type: "action.called", callId: "c1", name: "calculate", input: { expression: "6*7" }, tool: "unknown" },
      { type: "action.result", callId: "c1", output: { value: 42 }, status: "completed" },
      { type: "message", role: "assistant", text: "算好了,是 42。" },
    ]);
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 20, requests: 1 });
  });

  it("没有 steps:退回顶层 text / toolCalls / toolResults", () => {
    const { events } = fromAiSdk({
      text: "你好!",
      toolCalls: [{ toolCallId: "c1", toolName: "read_file", input: { path: "a.ts" } }],
      toolResults: [{ toolCallId: "c1", output: "content" }],
    });

    expect(events.map((e) => e.type)).toEqual(["action.called", "action.result", "message"]);
    expect(events[0]).toMatchObject({ tool: "file_read" });
  });

  it("usage:totalUsage 优先于 usage,cachedInputTokens 进 cacheReadTokens,requests = step 数", () => {
    const { usage } = fromAiSdk({
      steps: [{ text: "a" }, { text: "b" }],
      totalUsage: { inputTokens: 300, outputTokens: 50, cachedInputTokens: 120 },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    expect(usage).toEqual({ inputTokens: 300, outputTokens: 50, requests: 2, cacheReadTokens: 120 });
  });

  it("全零 usage 视为缺失(别让 maxTokens 拿 0 假通过时看起来像有数据)", () => {
    const { usage } = fromAiSdk({ steps: [{ text: "hi" }], usage: {} });
    expect(usage).toBeUndefined();
  });

  it("空文本 / 空白 step 不产 message 事件", () => {
    const { events } = fromAiSdk({ steps: [{ text: "  " }, { content: [{ type: "text", text: "" }] }] });
    expect(events).toEqual([]);
  });
});
