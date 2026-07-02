# Results Format —— 结果保存格式

这篇记录 `Artifacts()` 报告器写到本地磁盘的格式,也是 `niceeval view` 的离线输入契约。实现入口是 `src/runner/reporters/artifacts.ts`;核心类型在 `src/types.ts` 的 `RunSummary`、`EvalResult`、`StreamEvent`、`TraceSpan`、`O11ySummary` 和 `DiffData`。

## 目录结构

默认输出根目录是 `.niceeval/`。每次 run 一个时间戳目录,时间戳来自 `Date#toISOString()`,并把 `:` 与 `.` 替换成 `-`:

```text
.niceeval/
  2026-07-02T03-10-24-123Z/
    summary.json
    <evalId>/<agent>/<model>/a<attempt>/
      events.json
      sources.json
      trace.json
      o11y.json
      diff.json
```

`<evalId>/<agent>/<model>/a<attempt>/` 是单个 eval attempt 的工件目录。`evalId` 里的 `/` 会保留为目录层级,其它不适合路径的字符会替换成 `_`;`agent` 和 `model` 里的非 `[\w.@-]` 字符也会替换成 `_`。没有 model 时目录名是 `default`。

这些文件是按需写入的:某类数据为空就不生成对应 JSON 文件。`summary.json` 在 run 结束时写入;attempt 级重数据在每个 eval 完成时增量写入,所以长 run 中途失败时通常仍能留下已经完成的 attempt 工件。

## 版本与升级设计

当前已落盘的结果没有显式版本号,读取器只能把「有 `results[]` 且有 `startedAt`」的 JSON 当作 niceeval summary。为了让结果格式可扩展、可升级,下一版应把 `summary.json` 升级成整个 run 的 manifest,在顶层增加版本元数据:

```json
{
  "format": "niceeval.results",
  "schemaVersion": 1,
  "producer": {
    "name": "niceeval",
    "version": "0.12.0"
  },
  "artifacts": {
    "events": { "schemaVersion": 1, "encoding": "json-array" },
    "sources": { "schemaVersion": 1, "encoding": "json-array" },
    "trace": { "schemaVersion": 1, "encoding": "json-array" },
    "o11y": { "schemaVersion": 1, "encoding": "json-object" },
    "diff": { "schemaVersion": 1, "encoding": "json-object" }
  },
  "startedAt": "2026-07-02T03:10:24.123Z",
  "results": []
}
```

这里的取舍:

- **run 级 summary 是唯一入口。** 版本号放在 `summary.json` 顶层,因为所有 attempt 工件都通过 summary 引用。读取方先读 summary,再决定怎么读子文件。
- **attempt 文件保持裸 JSON array/object。** `events.json` 继续是 `StreamEvent[]`,不要为了塞版本号改成 `{ schemaVersion, data }`。这样脚本、view、调试时 `jq`/`node` 直接读数组的体验不被打破。
- **每类 artifact 有自己的 schemaVersion。** summary 的 `schemaVersion` 管 run manifest;`artifacts.events.schemaVersion` 管 `StreamEvent[]`;`artifacts.trace.schemaVersion` 管 `TraceSpan[]`。以后只改 trace 结构时,不必暗示 summary 也破坏兼容。
- **当前无版本结果按 legacy v0 读。** 缺少 `format` / `schemaVersion` 时,读取器按现在的格式解释:run manifest v0,artifact kinds v0。view 可以显示一个弱提示,但不应该拒绝读取。

版本号语义:

- `format` 必须等于 `"niceeval.results"`。这避免把其它工具的 `summary.json` 误读成 niceeval。
- `schemaVersion` 用整数,只在**破坏兼容读取**时递增。新增可选字段、增加新的 artifact kind、增加新的 `StreamEvent` variant,原则上不递增 summary major;读取器必须忽略未知字段和未知 artifact kind。
- `producer.version` 是 npm package 版本,用于排查「哪个 niceeval 写的这份报告」。它不是 schema 判断依据,不能用 `producer.version` 推断格式。
- 子 artifact 的 `schemaVersion` 同样用整数。比如未来 `events.json` 从裸 `StreamEvent[]` 改为 chunked 或 envelope,才需要把 `artifacts.events.schemaVersion` 从 1 升到 2。

升级规则:

1. **写新读旧。** writer 只写当前最新版;reader 至少支持当前版和 legacy v0。不要继续写多套格式。
2. **先 normalize 再渲染。** `readSummary` 应把 legacy v0 和未来 v1 都转成 view 内部统一模型,再进入 `aggregateRows` / `attachArtifactBase`。兼容逻辑集中在一个 loader 里,不要散在 React 组件里。
3. **未知字段保留容忍。** 读取器不应该因为多了 `environment`、`git`、`tags`、`agentSetup` 等字段失败;第三方 reporter 或未来版本可以安全扩展。
4. **未知 artifact kind 忽略。** 例如将来新增 `agent-setup.json`、`screenshots.json`、`classification.json`,旧 view 只是不展示,不能让整个 run 读取失败。
5. **破坏性升级要有迁移函数。** 如果 `schemaVersion` 递增到 2,实现上加 `normalizeSummaryV1` / `normalizeSummaryV2` 这类小函数;必要时提供 `niceeval migrate-results <path>` 把旧目录改写成新格式。
6. **不要用目录名表达 schema。** `.niceeval/<timestamp>/` 和 attempt 目录只表达身份与定位;版本全部在 JSON 内。这样复制、重命名、归档目录不会影响解析。

报告里最小应新增的字段是:

```typescript
interface ResultFormatMeta {
  format: "niceeval.results";
  schemaVersion: number;
  producer?: {
    name: "niceeval";
    version?: string;
    commit?: string;
  };
  artifacts?: Partial<Record<"events" | "sources" | "trace" | "o11y" | "diff" | string, {
    schemaVersion: number;
    encoding: "json-array" | "json-object";
  }>>;
}
```

这组字段应该放进 `RunSummary`,但 eval 作者的运行时 API 不需要看见它们;它们属于 reporter / view 的持久化契约。

## `summary.json`

`summary.json` 是瘦身后的 `RunSummary`,负责让控制台、`--resume` 和 `niceeval view` 先拿到榜单级信息:

```typescript
interface RunSummary {
  format?: "niceeval.results";
  schemaVersion?: number;
  producer?: { name: "niceeval"; version?: string; commit?: string };
  artifacts?: Record<string, { schemaVersion: number; encoding: "json-array" | "json-object" }>;
  name?: LocalizedText;
  agent: string;
  model?: string;
  startedAt: string;
  completedAt: string;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  durationMs: number;
  usage?: Usage;
  estimatedCostUSD?: number;
  results: EvalResult[];
  outputDir?: string;
}
```

`results[]` 里的每条 `EvalResult` 仍包含判决、断言、用量、成本、错误、fingerprint 和 experiment 元数据,但不会内联大字段:

- `events`
- `sources`
- `trace`
- `o11y`
- `diff`
- `rawTranscript`

这些字段被替换成 attempt 工件引用:

```typescript
{
  "artifactsDir": "weather/brooklyn/codex/gpt-5/a1",
  "hasEvents": true,
  "hasTrace": true,
  "hasSources": true
}
```

`artifactsDir` 是相对当前 run 目录的路径。`niceeval view` 读取 `summary.json` 后,会把它补成:

- `artifactBase`: 相对 view 输入根目录的路径,供前端请求 `/artifact?p=...`;
- `artifactAbsBase`: 本机绝对路径,供 UI 复制或展示。

注意:当前 summary 只有 `hasEvents`、`hasTrace`、`hasSources` 三个存在标记。`o11y.json` 和 `diff.json` 会写盘,但 summary 里还没有对应 `hasO11y` / `hasDiff` 标记;读取方需要按路径尝试读取或先检查文件存在。

## Attempt 级文件

### `events.json`

类型是 `StreamEvent[]`。这是从 agent 原始 transcript 归一化后的标准事件流,也是作用域断言、transcript 展示、工具调用统计的主要来源。

常见事件包括:

- `message`: assistant / user 文本;
- `action.called` / `action.result`: 工具调用与结果;
- `subagent.called` / `subagent.completed`: 子 agent 调用;
- `input.requested`: HITL 输入请求;
- `thinking`: 思考块;
- `compaction`: 上下文压缩;
- `error`: 运行时或采集错误。

文件内容是一个 JSON array,不是 JSONL / NDJSON。

### `sources.json`

类型是 `SourceArtifact[]`:

```typescript
interface SourceArtifact {
  path: string;
  content: string;
}
```

它只包含本次 test/断言通过 `loc` 引用到的 eval 源码片段。`niceeval view` 用它把 `t.send`、断言和运行结果叠回源码行。

### `trace.json`

类型是 `TraceSpan[]`。只有 agent 声明 tracing 能力、运行器收到 OTLP span 并成功归一化时才会生成。它回答「各步骤耗时多久、父子关系是什么」,与回答「做了什么」的 `events.json` 分开。

`TraceSpan.kind` 是 view 识别的核心字段,来自 canonical GenAI 语义角色:

- `turn`
- `model`
- `tool`
- `agent`
- `other`

原生 span 名和属性仍保留在 `name` / `attributes` 里,但 view 的分组与着色只应依赖 canonical 字段。

### `o11y.json`

类型是 `O11ySummary`。这是从标准事件流派生的行为摘要,包括工具调用计数、读写文件、shell 命令、web fetch、错误、思考块、压缩次数、耗时、usage 和估算成本。

这个文件面向人和调试脚本:当一个 attempt 失败时,先看 `summary.json` 的 `outcome` / `error`,再看 `events.json` 与 `o11y.json`,通常能分清是断言没过、agent runtime 错误,还是 adapter / provider / timeout 问题。

### `diff.json`

类型是 `DiffData`:

```typescript
interface DiffData {
  generatedFiles: Record<string, string>;
  deletedFiles: string[];
}
```

它只存在于有沙箱 workspace diff 的运行。coding-agent eval 常用它验证文件修改结果;remote / in-process agent 不一定有 diff。

## 读取规则

读取结果时优先从 `summary.json` 开始:

1. 读 `.niceeval/<run>/summary.json`,先用 `results[]` 判断 pass / fail / error / skip、耗时、成本和断言失败。
2. 对需要下钻的 result,用 `artifactsDir` 拼出 attempt 目录。
3. 按 `hasEvents` / `hasTrace` / `hasSources` 拉取 `events.json`、`trace.json`、`sources.json`。
4. 需要行为摘要或 workspace diff 时,尝试读取同目录的 `o11y.json` / `diff.json`。

`niceeval view` 的本地 server 只暴露 `.json` 工件,并把请求路径限制在 view 输入根目录内。`--out` 导出的静态 HTML 会把 summary 聚合数据烘焙进单文件;拆分工件仍是本地 view server 的按需读取能力。

## 与其它 reporter 的边界

这篇只描述默认 `Artifacts()` reporter 的本地目录格式。`Json(path)` reporter 写的是机器可读全量 JSON,用途不同;第三方实验平台 reporter 可以把同一批 `EvalResult` / `RunSummary` 转成自己的格式。

因此,不要在文档或工具里假设本地结果有 `results.jsonl`、transcript NDJSON 或固定测试输出文件。当前稳定契约是:

- run 级: `summary.json`;
- attempt 级: `events.json`、`sources.json`、`trace.json`、`o11y.json`、`diff.json`;
- 每个文件都是 JSON,不是 JSONL。
