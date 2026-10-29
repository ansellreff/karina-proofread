import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./config";
import { hiddenCharacters, stripHidden } from "./hidden";
import { inlineEdits } from "./inline";
import type { RuleContext } from "./types";

const ctx = (...texts: string[]): RuleContext =>
  ({
    fileName: "x.docx",
    docType: "Study Plan",
    fullText: texts.join("\n"),
    paras: texts.map((text, index) => ({ index, text, words: text.split(/\s+/).length, sentences: 1, inTable: false, isList: false, isShort: false })),
    config: DEFAULT_RULES,
  }) as RuleContext;

describe("Remove hidden characters", () => {
  it("removes invisible characters as tracked fixes, a run of them as one, each with a note", () => {
    const edits = hiddenCharacters(ctx("my​​research plan﻿", "clean text"));
    expect(edits.map(({ para, start, end, text }) => ({ para, start, end, text }))).toEqual([
      { para: 0, start: 2, end: 4, text: "" },
      { para: 0, start: 17, end: 18, text: "" },
    ]);
    expect(edits[0].reason).toMatch(/2 hidden characters \(zero-width space\)/);
    expect(edits[1].reason).toMatch(/byte-order mark/);
    expect(edits.every((e) => e.kind === "fix" && e.rule === "hidden-characters")).toBe(true);
  });

  it("odd spaces become normal spaces; the ordinary non-breaking space and Chinese full-width space stay", () => {
    expect(stripHidden("my plan in Taipei")).toBe("my plan in Taipei");
    expect(stripHidden("10 km 台北　大學")).toBe("10 km 台北　大學");
  });

  it("look-alike letters inside an English word become normal letters; real Russian or Greek words stay", () => {
    expect(stripHidden("my rеsеarch plаn")).toBe("my research plan"); // Cyrillic е and а
    expect(stripHidden("Москва and Αθήνα")).toBe("Москва and Αθήνα");
    expect(hiddenCharacters(ctx("plаn"))[0].reason).toMatch(/Cyrillic/);
  });

  it("keeps joiners that belong to an emoji or to scripts that need them; removes hidden tag characters", () => {
    expect(stripHidden("👩‍💻 family")).toBe("👩‍💻 family");
    expect(stripHidden("plan\u{E0041}\u{E0042} text")).toBe("plan text");
  });

  it("runs first among the text fixes, is on by default, and can be switched off", () => {
    const on = inlineEdits(ctx("my​research"));
    expect(on.some((e) => e.rule === "hidden-characters")).toBe(true);
    const off = structuredClone(DEFAULT_RULES);
    off.builtIn.hiddenCharacters.enabled = false;
    expect(inlineEdits({ ...ctx("my​research"), config: off }).some((e) => e.rule === "hidden-characters")).toBe(false);
  });
});
