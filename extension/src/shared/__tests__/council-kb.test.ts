import { describe, expect, it, vi } from "vitest";
import type { BrandAssets, KBEntry, PersonalizationInput } from "../types";

const prompts = vi.hoisted(() => [] as { system: string; user: string }[]);
vi.mock("../agents/llm-client", () => ({
  resolveLLMConfig: () => ({ provider: "anthropic", apiKey: "", model: "test" }),
  makeLLMClient: () => ({
    call: async (system: string, user: string) => {
      prompts.push({ system, user });
      if (system.startsWith("You are the Retrieval Agent")) return '{"relevant_source_ids":["kb-long","kb-short"],"citations":[],"missing_info":[]}';
      if (system.startsWith("You are the ICP Personalization Agent")) return '{"slides":[{"index":0,"title":"Exit plan","components":[{"type":"text_block","content":"Data is kept seven years."}]}]}';
      if (system.startsWith("You are the Brand Compliance Agent")) return '{"pass":true,"violations":[],"tone_score":9}';
      return '{"grounded":true,"claims":[]}';
    },
  }),
}));

import { runCouncil } from "../agents/council";

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Section ${i} describes routine onboarding work for finance teams.`).join(" ");

const entry = (id: string, content: string): KBEntry =>
  ({ id, name: id, namespace: "product_overview", content, status: "ready" }) as KBEntry;

describe("pitch council KB context", () => {
  it("shows drafter and validator the same query-relevant parts of a long entry", async () => {
    const long = `Handbook overview for new customers. ${filler(40)}\n\nData retention and exit. Records are retained for seven years. Exports are delivered within 30 days of exit.`;
    expect(long.indexOf("seven years")).toBeGreaterThan(1500);
    const kb = [entry("kb-long", long), entry("kb-short", "Short pricing note.")];
    const input = { company_name: "Acme", persona_role: "CFO", deal_size: "100k_1m", pain_points: "data retention and a clear exit plan" } as PersonalizationInput;
    for await (const _ of runCouncil({ input, brandAssets: { primary_color: "#000000" } as BrandAssets, kb })) { /* drain */ }

    const sources = (agent: string) => {
      const p = prompts.find((x) => x.system.startsWith(`You are the ${agent}`));
      return p?.user.match(/SOURCES[^\n]*\n([\s\S]*<\/kb_source>)\n/)?.[1];
    };
    const drafter = sources("ICP Personalization Agent");
    const validator = sources("Fact Validation Agent");
    expect(drafter).toContain("Records are retained for seven years.");
    expect(drafter).toContain("Exports are delivered within 30 days of exit.");
    expect(drafter).toContain("Handbook overview for new customers.");
    expect(drafter).toContain("Short pricing note.");
    expect(validator).toBe(drafter);
  });
});
