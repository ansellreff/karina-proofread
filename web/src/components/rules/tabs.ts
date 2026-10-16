export const RULE_TABS = [
  { id: "yours", label: "Your rules" },
  { id: "learned", label: "From your reviews" },
  { id: "checks", label: "Built-in checks" },
  { id: "format", label: "Formatting" },
  { id: "grammar", label: "Grammar checker" },
  { id: "names", label: "Names & acronyms" },
  { id: "try", label: "Try it" },
  { id: "ai", label: "AI rulebook" },
] as const;

export type RuleTab = (typeof RULE_TABS)[number]["id"];
