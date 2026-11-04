// Offline check for the eval CLI shim: a missing `claude` binary must fail fast, not hang.
import { expect, test } from "bun:test";
import { CALL_LOG, callClaude } from "./claude-cli.mjs";

test("missing claude binary resolves ok:false quickly", async () => {
  const savedPath = process.env.PATH;
  process.env.PATH = "/nonexistent-eval-path";
  try {
    const t0 = Date.now();
    const r: any = await callClaude({ model: "x", system: "s", messages: [{ role: "user", content: "hi" }], label: "spawn-error" });
    expect(r.ok).toBe(false);
    expect(r.limitHit).toBe(false);
    expect(r.rec.is_error).toBe(true);
    expect(r.rec.result_head).toContain("could not be started");
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(CALL_LOG.filter((c: any) => c.label === "spawn-error").length).toBe(1);
  } finally {
    process.env.PATH = savedPath;
  }
});

test("spawn that throws synchronously resolves ok:false", async () => {
  // A NUL byte in an argument makes spawn throw before any process exists.
  const r: any = await callClaude({ model: "x", system: "bad\u0000arg", messages: [{ role: "user", content: "hi" }], label: "spawn-throw" });
  expect(r.ok).toBe(false);
  expect(r.rec.result_head).toContain("could not be started");
  expect(CALL_LOG.filter((c: any) => c.label === "spawn-throw").length).toBe(1);
});
