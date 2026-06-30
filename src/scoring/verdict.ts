// 判决:把执行结果 + 断言 + 跳过原因折叠成一个 Verdict(见 docs/scoring.md)。

import type { AssertionResult, ResultOutcome, Verdict } from "../types.ts";

export function computeVerdict(input: {
  error?: string;
  assertions: readonly AssertionResult[];
  skipReason?: string;
}): Verdict {
  if (input.error !== undefined) return "failed";

  for (const a of input.assertions) {
    if (a.passed) continue;
    if (a.severity === "gate") return "failed";
  }

  if (input.skipReason !== undefined) return "skipped";
  return "passed";
}

export function computeOutcome(input: {
  error?: string;
  verdict: Verdict;
}): ResultOutcome {
  return input.error !== undefined ? "errored" : input.verdict;
}
