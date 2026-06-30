import { defineEval } from "fasteval";

// 多轮纯文本对话:考上下文记忆。最后一条 calledTool 故意失败,用来验证「失败行 / 失败 eval」红色态。
export default defineEval({
  description: "AI 助手:多轮纯文本对话",

  async test(t) {
    (await t.send("请用一句话介绍一下自己")).expectOk();
    (await t.send("你刚才说的是什么语言?")).expectOk();
    (await t.send("好的,谢谢你的回答")).expectOk();

    await t.group("三轮都正常收发", () => {
      t.succeeded();
      t.noFailedActions();
    });

    await t.group("第二轮能回忆起第一轮内容", () => {
      t.messageIncludes(/中文|汉语|Chinese/i);
    });

    // 故意失败:纯文本路径并不会调用工具 —— 用来展示红色的失败断言行 + 失败 eval。
    t.calledTool("get_weather");
  },
});
