import { defineEval } from "fasteval";

// 工具调用:助手应调用 get_weather 并给出结果。最后一条 judge 写了阈值 .atLeast(0.9) = 硬 gate,
// 回答没有湿度 → mock judge 给 0.3 → 不够 → 红行 + eval failed(阈值即硬下限;只想记分不挂用 .soft())。
export default defineEval({
  description: "AI 助手:天气工具调用",

  async test(t) {
    (await t.send("北京今天天气如何?")).expectOk();

    await t.group("调用了天气工具并给出结果", () => {
      t.succeeded();
      t.calledTool("get_weather");
      t.messageIncludes(/晴|°C|气温/);
    });

    // .atLeast(0.9) = 硬 gate:回答里没有湿度信息 → mock judge 给 0.3 → 不够阈值 → 红行 + eval failed。
    t.judge.autoevals.closedQA("回答是否同时包含了温度和湿度信息?").atLeast(0.9);
  },
});
