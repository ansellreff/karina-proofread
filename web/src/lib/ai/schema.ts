import { z } from "zod";

/** What Claude returns: Karina-style edits addressed by paragraph id ([P#]) and exact text. */
export const ReviewSchema = z.object({
  english_quality: z.enum(["good", "average", "weak"]),
  replacements: z.array(
    z.object({
      paragraph: z.number().int(),
      find: z.string(),
      replace: z.string(),
      beyond_style: z.boolean(),
      reason: z.string(),
    }),
  ),
  insertions: z.array(
    z.object({
      paragraph: z.number().int(),
      after: z.string(),
      text: z.string(),
      kind: z.enum(["note", "fix"]),
      beyond_style: z.boolean(),
      reason: z.string(),
    }),
  ),
  paragraph_deletions: z.array(z.object({ paragraph: z.number().int(), reason: z.string() })),
  suggestion_paragraphs: z.array(z.object({ after_paragraph: z.number().int(), text: z.string() })),
  end_note_items: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** JSON schema for structured outputs (kept in sync with ReviewSchema). */
export const REVIEW_JSON_SCHEMA = obj({
  english_quality: { type: "string", enum: ["good", "average", "weak"] },
  replacements: { type: "array", items: obj({ paragraph: int, find: str, replace: str, beyond_style: bool, reason: str }) },
  insertions: {
    type: "array",
    items: obj({ paragraph: int, after: str, text: str, kind: { type: "string", enum: ["note", "fix"] }, beyond_style: bool, reason: str }),
  },
  paragraph_deletions: { type: "array", items: obj({ paragraph: int, reason: str }) },
  suggestion_paragraphs: { type: "array", items: obj({ after_paragraph: int, text: str }) },
  end_note_items: { type: "array", items: str },
});
