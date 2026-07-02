# Adapter 写法 —— 分档递进,不用一次做全套

这一篇讲怎么把一个 adapter **写出来**:按档递进(每一档要写什么代码、解锁什么断言)、remote / sandbox 两个参考实现、采集层技巧、`shared` 工具袋。每个 `t` API 的精确适配义务(返回什么、违约怎么暴露)是规范内容,见 [Adapter 契约](contract.md)——写每一档之前先把对应义务读一遍。

## 分档:声明什么,承诺什么

`AgentCapabilities` 每个位都是独立开关:先做你已经做到的,其余留到需要时再补——**每一档解锁的是具体的 `t` 函数和断言,不是笼统的"更多能力"**。晚做高档不影响先跑起来的 eval,也不用改核心一行。

| 档位 | 声明 | adapter 要做什么 | 解锁的 `t` 函数 / 断言 |
|---|---|---|---|
| **T0 · 收发消息** | (无) | 只实现 `send`,返回 `{ events: [], data, status }`。remote agent 把响应塞进 `data`;sandbox agent 按 `res.exitCode` 定 `status` | `t.send()`(单发一轮)、`t.sendFile()`(能调;文件是否起作用取决于 adapter 读不读 `TurnInput.files`)、`turn.outputEquals` / `outputMatches`、按 `status` 判的 `t.succeeded()` |
| **T1 · 事件流** | `toolObservability` | 把原始返回映射成**完整**的 `StreamEvent[]`(callId 配对、时序保真、双名字,纪律见[契约 · 标准事件流](contract.md#标准事件流))。remote 在 `send` 里直接翻译;sandbox 加一个 transcript 解析器(`o11y/parsers/<name>.ts`) | 整套作用域断言:`calledTool` / `toolOrder` / `usedNoTools` / `maxToolCalls` / `messageIncludes` / `noFailedActions` / `calledSubagent` / `event` / `eventOrder` / `eventsSatisfy`;**负断言(`notCalledTool` / `notEvent`)从此才可信** |
| **T2 · 多轮会话** | `conversation` | `send` 按 `ctx.session.isNew / id` 区分 fresh / resume,回写 `id`(义务细节见[契约 · t.newSession](contract.md#tnewsession))。CLI 有原生 `--resume <id>` 就直接接;没有就每轮自带完整上下文 | `t.send()` 可多次、`t.reply`、`t.newSession()` |
| **H · HITL** | `conversation`(+ 建议中的 `hitl` 位,见[契约 · 能力守卫](contract.md#能力守卫没做到的实现怎么暴露目标设计)) | 在 T2 之上加两条行为:agent 停下等人时 `status` 置 `"waiting"`、每个待回答问题吐一条 `input.requested`(字段填法见[契约 · InputRequest](contract.md#inputrequesthitl-请求要填哪些字段));`respond` 的回答经 resume 交回 | `t.parked()`、`t.requireInputRequest(filter?)`、`t.respond(...)` / `t.respondAll(optionId)` |
| **T3 · tracing / OTel** | `tracing` | 一个 `tracing` 块(env-based 或 file-based 导出配置)+ 一个 span mapper(`o11y/otlp/mappers/<name>.ts`,归一到 canonical GenAI semconv)。remote agent 少见(没有独立进程可挂 exporter,一般跳过);没有 OTel 输出的 CLI 可从 transcript 时间戳合成 span,见 [Observability · OTLP traces](../observability.md#otlp-traces--统一瀑布图) | `EvalResult.trace`、`niceeval view` 瀑布图,可跨 agent 叠加对比 |

两点修正 / 提醒(相对早期文档):

- **HITL 不是"T1 + T2 的交集"。** `input.requested` 是独立事件类型,不需要完整的工具可观测;HITL 真正依赖的是 T2 的 resume(`respond` 本质是拿着回答再发一轮,得靠同一条 session 续上)+ 上表那两条专门行为。三个义务缺一的具体后果,见[契约 · HITL 握手](contract.md#hitl-握手一次完整时序)。
- **能力位是 opt-out 的**(`defineSandboxAgent` 默认全开 `conversation + toolObservability + workspace + sandbox`)。所以"按档递进"的实际操作是:**从 T0 起步时,把你还没做到的位显式关掉**;做到了再打开。不关掉,负断言会静默失真,见[契约 · 负断言完整性规则](contract.md#负断言的完整性规则)。

T0 / T1 是"接得上"的门槛;T2、H、T3 都是"要更细信号"时再加的增量。两种 kind(remote / sandbox)都不动核心一行——这是设计承重墙,见 [Vision](../vision.md)。

## remote agent:评你自己的 agent / 函数 / 服务

进程内最快零网络;远程就是 `send` 里发个 fetch。两者都是 `defineAgent`,差别只在 `send` 内部:

```typescript
// agents/my-agent.ts —— 进程内
import { defineAgent } from "niceeval/adapter";
import { myAgent } from "../src/agent.js";

export default defineAgent({
  name: "my-agent",
  capabilities: { conversation: true, toolObservability: true },
  async send(input, ctx) {
    const res = await myAgent.handle(input.text, { signal: ctx.signal });
    // 把你的返回映射成标准事件流;message/toolCalls 由 core 从 events 派生
    return { events: toStreamEvents(res), data: res.json, status: "completed" };
  },
});
```

```typescript
// agents/support-bot.ts —— 远程,URL 是它的私事(niceeval 不定协议)
export default defineAgent({
  name: "support-bot",
  capabilities: { conversation: true, toolObservability: true },
  async send(input, ctx) {
    const r = await fetch(`${process.env.SUPPORT_BOT_URL}/chat`, {
      method: "POST", body: JSON.stringify({ message: input.text }), signal: ctx.signal,
    });
    const body = await r.json();
    return { events: toStreamEvents(body), data: body.output, status: "completed" };
  },
});
```

`toStreamEvents` 是你写的小映射:把你服务的"它说了啥、调了哪些工具"翻成标准事件。这是 remote agent 作者唯一的活。

## sandbox agent:评 coding agent(claude-code / codex / bub)

它的"连接"不是 wire 协议,而是:在沙箱里 spawn agent 的 CLI、把 prompt 当参数丢进去、让它在沙箱文件系统上自己跑工具、跑完读回 transcript。

claude-code 和 codex 用**同一套**模型,绝大部分**共享**,只有 5 个点因 agent 而异:

| 步骤 | 共享? | claude-code | codex |
|---|---|---|---|
| 起沙箱 + 写入起始文件 + `git` 基线 | ✅ 共享(runner 固定段) | — | — |
| 装 CLI | ✗ | `npm i -g @anthropic-ai/claude-code` | `npm i -g @openai/codex` |
| 鉴权 | ✗ | env `ANTHROPIC_API_KEY` | `codex login --with-api-key` + profile |
| 拼调用 + 丢 prompt | ✗ | `claude --print [--model <m>] --dangerously-skip-permissions <prompt>` | `codex exec --profile default --json <prompt>` |
| 模型/参数 | ✗ | CLI flag `--model`(来自 `ctx.model`) | 写 `~/.codex/default.config.toml`(同) |
| 读 transcript → 解析成 events | ✗ | `~/.claude/projects/.../{session}.jsonl` 最新一个 | `--json` stdout 即 JSONL |
| 归一化 events → diff → 验证 | ✅ 共享 | — | — |

"共享"的部分由 niceeval 提供(runner 固定段 + 下文 [shared](#shared沙箱型-adapter-的工具袋)),所以**每个沙箱 adapter 真正要写的,就是中间那 5 行差异 + 一个 transcript 解析器**。内置 `claude-code` 的真实实现(`src/agents/claude-code.ts`)骨架:

```typescript
import { defineSandboxAgent, shared } from "niceeval/adapter";
import { requireEnv } from "niceeval";

// 鉴权是 agent 本地配置(见契约 · 三类配置的归属);注意「没有 model」——留空,实验决定
const auth = () => ({ ANTHROPIC_API_KEY: requireEnv("ANTHROPIC_API_KEY") });

export default defineSandboxAgent({
  name: "claude-code",
  capabilities: { conversation: true, toolObservability: true, workspace: true, compactionObservability: true },
  // 装 CLI 放 setup:每个沙箱一次,不随每轮 send 重装
  async setup(sb) {
    await sb.runShell("command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code");
  },
  // 运行器已备好沙箱(上传 / git 基线),经 ctx.sandbox 传入
  async send(input, ctx) {
    const sb = ctx.sandbox;

    const args = ["--print", "--dangerously-skip-permissions"];
    if (ctx.model) args.push("--model", ctx.model);              // 实验给了才传;否则用 CLI 原生默认
    if (ctx.flags.webResearch) args.push("--allowedTools", "WebSearch,WebFetch"); // 读实验 feature flag
    if (!ctx.session.isNew && ctx.session.id) args.push("--resume", ctx.session.id); // 多轮续接
    args.push(input.text);

    const res = await sb.runCommand("claude", args, { env: auth() });

    // 采集(脏):磁盘旁读最新 JSONL;转换(净):shared.parseClaudeCode 只吃 raw 字符串
    const raw = await shared.captureLatestJsonl(sb, "~/.claude/projects");
    ctx.session.id = shared.sessionIdFromClaudeTranscript(raw) ?? ctx.session.id;  // 回传供下轮 resume
    const parsed = shared.parseClaudeCode(raw);   // → { events, usage, … }
    return { events: parsed.events, usage: parsed.usage, status: res.exitCode === 0 ? "completed" : "failed" };
  },
});
```

接一个新 coding agent(比如 bub 之外的下一个)照抄此形状:换装法、换鉴权、换拼参、换 transcript 位置,再写一个解析器。

## 采集层:原始数据怎么从 agent CLI 弄到手

上面示例里 sandbox agent 靠 transcript JSONL 产事件流;但"怎么弄到这份原始数据"因 CLI 而异,是 `send` 里除了拼调用之外的另一半活。这里讲通用纪律;**每个 agent 具体走哪条路径、每个字段从原始数据的哪里抠,见 [采集矩阵](collection.md)**。三条实际路径,互不排斥,一个 agent 可能同时踩中好几条:

1. **磁盘旁读。** 多数 coding agent CLI 出于自己的会话续接(resume)需求,本来就会把完整交互写到磁盘——这不是它们为你设计的可观测性接口,只是"顺手"能读出来。claude-code 写 `~/.claude/projects/<project>/<session>.jsonl`,adapter 在 `send` 跑完后用 `shared.captureLatestJsonl(sandbox, dir)` 找最新一份读出来当 transcript。
2. **stdout/stderr 结构化捕获。** 给 CLI 传一个能让它打结构化日志的 flag(`--json` / `--format json`),把 `stdout + stderr` 拼起来当 transcript——本质上和"跑一条命令、把输出重定向到文件"没有区别。codex `codex exec --json` 走的是这条(配 `shared.extractJsonlFromStdout`)。
3. **OTLP 网络接收。** 前两条给的是"做了什么"(`StreamEvent[]`);trace 走独立通道——agent 经 OpenTelemetry 把 span **推**给运行器起的本机接收器,不是从文件/输出里"读"出来的(见 [Observability · OTLP traces](../observability.md#otlp-traces--统一瀑布图))。

**采集层允许脏,转换层必须干净。** 具体路径、CLI flag、文件在哪、版本升级导致的格式漂移——这些都是没办法的事,注定要写一堆 per-agent 的 hack 和 fallback。但只要采集层的产出**统一收窄成"一个原始字符串 + 一个 agent 标识"**再交给转换层,转换层就可以完全不碰沙箱、不碰 CLI 细节,只做纯数据变换、可独立单测——`o11y/parsers/<agent>.ts` 的解析函数只接收 `raw: string`,签名里没有 `sandbox` 或 `ctx`,就是这条边界的直接体现。这条边界不是 niceeval 独创的直觉,是从分析 Vercel agent-eval 的实现里得到印证的模式,细节见 [agent-eval 参考:采集 / 转换 / 落地三层](reference/agent-eval.md)。

**容错:一行解析失败,不拖垮整份 transcript。** JSONL 逐行 `JSON.parse`,每一行单独 try/catch;某一行失败只把 `parseSuccess` 标 `false`,不中断——继续解析剩下的行,已经解析出的事件照常保留(见 [Observability](../observability.md#transcript--标准事件流))。

**一个 agent 的采集可以是多条互不相干的通道。** codex 用 stdout 当主 transcript,却另从磁盘 session 文件里读"实际用的模型"——按"这份数据要用来干什么"分别决定怎么采,不要假设一种机制满足所有需求(教训来自 [agent-eval 参考笔记](reference/agent-eval.md#采集层两份-parser-之前原始数据从哪来))。

## shared:沙箱型 adapter 的工具袋

跨沙箱 adapter 复用、不属于任何单个 agent 的逻辑,由 niceeval 从 `niceeval/adapter` 导出(`src/agents/shared.ts`):

- **采集辅助** —— `captureLatestJsonl(sandbox, dir)`(磁盘旁读最新 JSONL)、`extractJsonlFromStdout(stdout)`(stdout 捕获过滤)、`writeFile` / `ensureInstalled`(setup 常用)。
- **会话 id 抽取** —— `sessionIdFromClaudeTranscript(raw)`、`codexThreadId(raw)`、`firstJsonField(raw, field)`(通用兜底)。
- **转换器** —— `parseClaudeCode(raw)` / `parseCodex(raw)` / `parseBub(raw)`:原始 JSONL → `{ events, usage, compactions, … }`,adapter 直接把结果铺进 `Turn` 返回。

git 基线与 diff 采集**不在 shared 里**——那是 runner 的固定段(沙箱创建时打一次基线、销毁前采一次 diff,见 `src/runner/sandbox-prep.ts`),对所有 agent 严格一致,adapter 不碰。中间"什么时候写入文件、什么时候调 `t.send()`、什么时候手工跑校验命令"全部由 eval 的 `test(t)` 自己决定,见 [Eval Authoring · 沙箱型](../eval-authoring.md#沙箱型手工把文件放进沙箱)。

## 没有注册表

没有按名字选 agent 的注册表——一个 config 文件对应一个(或一组固定的)agent,内置 coding-agent(`claude-code` / `codex` / `bub`)从 `niceeval/adapter` 导出,在 experiment 文件里直接引用。要换 agent 或 model,复制一个 experiment 文件改配置,不是靠 `--agent` 这类运行时选择器。

## 相关阅读

- [Adapter 契约](contract.md) —— 逐 API 的适配义务、事件流纪律、违约暴露方式。
- [Coding Agent Skills / Plugins DX](coding-agent-skills-plugins.md) —— 沙箱型 adapter 怎么装 skill / plugin 并组织 A/B 实验。
- [Observability](../observability.md) —— transcript 归一化、规范工具名、OTLP trace、usage / cost。
- [Sandbox](../sandbox.md) —— 沙箱接口与后端;adapter 只通过 `Sandbox` 接口和它交互。
- [agent-eval 参考](reference/agent-eval.md) —— 别人怎么做同一件事的源码阅读记录。
