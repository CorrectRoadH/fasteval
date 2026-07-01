import { describe, expect, it } from "vitest";
import { formatThrown } from "./util.ts";

describe("formatThrown", () => {
  it("uses the stack trace when available, so the report can locate the throw site", () => {
    function throwsFromHere(): never {
      throw new TypeError("Cannot read properties of undefined (reading 'text')");
    }
    let caught: unknown;
    try {
      throwsFromHere();
    } catch (e) {
      caught = e;
    }
    const formatted = formatThrown(caught);
    expect(formatted).toContain("TypeError: Cannot read properties of undefined (reading 'text')");
    expect(formatted).toContain("throwsFromHere");
    expect(formatted).toContain("util.test.ts");
  });

  it("falls back to name: message when the error has no stack", () => {
    const e = new Error("boom");
    delete (e as { stack?: string }).stack;
    expect(formatThrown(e)).toBe("Error: boom");
  });

  it("stringifies non-Error thrown values", () => {
    expect(formatThrown("just a string")).toBe("just a string");
    expect(formatThrown(42)).toBe("42");
  });
});
