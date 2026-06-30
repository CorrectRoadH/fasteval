import { defineEval } from "fasteval";

// 工具调用:助手应调用 get_weather 并给出结果。最后一条 soft judge 故意低分(回答没有湿度),
// 用来验证「soft 断言失败 = 红色行,但 eval 整体仍通过」——pass/fail 是断言级二元,没有 scored 中间态。
export default defineEval({
  description: "AI 助手:天气工具调用",

  async test(t) {
    (await t.send("北京今天天气如何?")).expectOk();

    await t.group("调用了天气工具并给出结果", () => {
      t.succeeded();
      t.calledTool("get_weather");
      t.messageIncludes(/晴|°C|气温/);
    });

    // soft + 高阈值:回答里没有湿度信息 → mock judge 给 0.3 → 不通过(红行),但不 gate,eval 仍 pass。
    t.judge.score("回答是否同时包含了温度和湿度信息?").atLeast(0.9);
  },
});
