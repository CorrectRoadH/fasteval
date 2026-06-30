import { defineAgent } from "fasteval";
import type { Agent, StreamEvent } from "fasteval";

// 确定性的进程内 mock agent:不联网、不起沙箱。按本轮输入(有无附件 / 关键词)返回固定事件流,
// 让 view 的代码视图能稳定复现每条分支(纯文本回复、思考、工具调用、图片描述)。
export function mockAgent(): Agent {
  return defineAgent({
    name: "mock",
    capabilities: { conversation: true, toolObservability: true },

    async send(input) {
      const text = input.text ?? "";
      const events: StreamEvent[] = [];

      if (input.files?.length) {
        events.push({ type: "thinking", text: "用户发来一张图片,我先看清主色调和主要元素,再描述。" });
        events.push({
          type: "message",
          role: "assistant",
          text: "这张图片的主色调是蓝色,中间有一个白色的方块,整体是一张简洁的图形。",
        });
      } else if (/天气|weather/i.test(text)) {
        events.push({ type: "thinking", text: "用户问天气,我需要调用 get_weather 工具拿到实时数据。" });
        events.push({ type: "action.called", callId: "w1", name: "get_weather", input: { city: "北京" }, tool: "unknown" });
        events.push({ type: "action.result", callId: "w1", output: { tempC: 25, condition: "晴" }, status: "completed" });
        events.push({ type: "message", role: "assistant", text: "北京今天天气晴,气温约 25°C,适合出门活动。" });
      } else if (/介绍.*自己|自我介绍/.test(text)) {
        events.push({
          type: "message",
          role: "assistant",
          text: "我是一个乐于助人的中文 AI 助手,可以帮你解答问题、查资料、看图和聊天。",
        });
      } else if (/什么语言|哪种语言|语言/.test(text)) {
        events.push({ type: "message", role: "assistant", text: "我刚才用的是中文(汉语)。" });
      } else {
        events.push({ type: "message", role: "assistant", text: "好的,我明白了,有需要随时找我。" });
      }

      return { events, status: "completed", usage: { inputTokens: 60, outputTokens: 24, requests: 1 } };
    },
  });
}
