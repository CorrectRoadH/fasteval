// view 端到端验证夹具的入口:
//   1) 起一个本机 mock judge(OpenAI 兼容 /chat/completions),返回确定性的 {reasoning, score}
//   2) 用 mock agent 跑全部 eval(--fresh,每次重新生成工件)
//   3) 落地 .fasteval/<run>/…(summary.json + 每 attempt 的 events/sources/…)
//
// 用法:
//   node test/view-harness/run.mjs            # 跑一遍,生成 .fasteval
//   然后:node bin/fasteval.js view test/view-harness/.fasteval --port 5199
//
// 全程不联网、不需要任何真实 API key 或 Docker。

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rm } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/** mock judge:按被评内容里的关键词给确定性分数 + 理由。 */
function scoreFor(userContent) {
  const c = String(userContent);
  if (/湿度/.test(c)) {
    return { reasoning: "回答只提到了温度(晴、25°C),完全没有湿度信息,不满足「同时包含温度和湿度」的要求。", score: 0.3 };
  }
  if (/图片|蓝色|方块|颜色/.test(c)) {
    return { reasoning: "助手准确描述了蓝色背景和中间的白色方块,切题且完整,没有答非所问。", score: 0.85 };
  }
  // probe（"Reply with the number 1 only."）或其它:回个 1。
  return { reasoning: "ok", score: 1 };
}

function startMockJudge() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        let userContent = "";
        try {
          const parsed = JSON.parse(body || "{}");
          const msgs = parsed.messages ?? [];
          userContent = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n");
        } catch {
          /* ignore */
        }
        const { reasoning, score } = scoreFor(userContent);
        const payload = {
          choices: [{ message: { role: "assistant", content: JSON.stringify({ reasoning, score }) } }],
        };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  // 干净起点:删掉上次的 .fasteval,这样 view 里只剩本次结果。
  await rm(join(here, ".fasteval"), { recursive: true, force: true });

  const judge = await startMockJudge();
  const port = judge.address().port;
  const env = {
    ...process.env,
    FASTEVAL_JUDGE_BASE: `http://127.0.0.1:${port}/v1`,
    FASTEVAL_JUDGE_KEY: "mock-key",
  };

  console.log(`[harness] mock judge on http://127.0.0.1:${port}`);
  console.log(`[harness] running evals (mock agent)…\n`);

  const child = spawn(process.execPath, [join(repoRoot, "bin", "fasteval.js"), "exp", "--fresh"], {
    cwd: here,
    env,
    stdio: "inherit",
  });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  judge.close();

  console.log(`\n[harness] done (exit ${code}).`);
  console.log(`[harness] view it:\n  node bin/fasteval.js view test/view-harness/.fasteval --port 5199 --no-open`);
  // exit 1 只是因为夹具里有一条故意失败的 eval;对夹具本身不算错。
  process.exit(0);
}

main();
