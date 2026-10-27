import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, validateRules, withDefaults, type RuleConfig } from "./config";

/** The rules file used on this computer, and online as the default until Karina saves her own. */
const bundled = withDefaults(JSON.parse(readFileSync(path.join(process.cwd(), "prompts", "karina-rules.json"), "utf8")) as Partial<RuleConfig>);

describe("default rules", () => {
  it("include “Change contraction words” for the AI, on every document type, in the defaults and in the rules file", () => {
    for (const rules of [DEFAULT_RULES, bundled]) {
      const r = rules.custom.find((c) => c.label === "Change contraction words");
      expect(r).toMatchObject({ enabled: true, action: "ai", docTypes: [] });
      expect(r?.text).toMatch(/full forms/);
      expect(r?.text).toMatch(/can't should be cannot/);
      expect(validateRules(rules)).toEqual([]);
    }
    // six rules come with the app: the five notes and this AI rule
    expect(DEFAULT_RULES.custom).toHaveLength(6);
  });
});
