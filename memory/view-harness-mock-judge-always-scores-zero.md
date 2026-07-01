# view-harness 的 mock judge 对 closedQA 恒定打 0 分——`scoreFor()` 的分支从未真正生效

**现象**：`node test/view-harness/run.mjs` 里,`weather-tool` 和 `image-understanding` 两条 eval 的 `judge:autoevals:closedQA` 永远显示 `got 0.00` + `evaluation error: No tool calls in response`,跟 `run.mjs` 里 `scoreFor()` 按关键词给 0.85 / 0.3 / 1 的设计意图完全对不上。

**根因**:`autoevals` 的 `closedQA`(`node_modules/autoevals/jsdist/index.mjs`)要求评判模型的回复走 **tool-calling**(`message.tool_calls`)返回结构化分数,拿不到就直接 `throw new Error("No tool calls in response")`。但 `run.mjs` 里 `startMockJudge()` 起的假 OpenAI 兼容 server 只把 `{reasoning, score}` 塞进 `message.content`(纯文本 JSON),没有 `tool_calls` 字段——所以每次都在 `AssertionCollector.finalize` 里被 catch 住,分数恒为 0、`detail` 里带上这句报错。因为 `closedQA` 走的是 soft 严重级、非 `--strict`,这个恒 0 分不会让 outcome 变 failed,长期没被注意到。

**修法**:目前没修——`scoreFor()` 的关键词分支目前是死代码,判断力气都白费了;真要让 view-harness 的 judge demo 反映实际输入,需要让 `startMockJudge` 按 `autoevals` 期望的 tool-calling 格式(`choices[0].message.tool_calls`)回复,而不是纯 `content`。排查 view-harness 里任何 `judge` 相关分数/断言时,先确认是不是踩了这个恒 0 分陷阱,不要误以为是被评材料或 judge 逻辑本身的问题。
