import { describe, expect, it } from "vitest";
import { shortcutFor } from "./use-shortcuts";

/** A fake event target: `inside` lists the selectors it sits within. */
const target = (inside: string[] = []) => ({ closest: (sel: string) => (sel.split(",").some((s) => inside.some((i) => s.includes(i))) ? {} : null) });
const key = (k: string, opts: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}, inside: string[] = []) =>
  shortcutFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...opts, target: target(inside) });

describe("review-page shortcuts", () => {
  it("maps letters outside the text", () => {
    expect(key("j")).toBe("next");
    expect(key("K")).toBe("prev");
    expect(key("a")).toBe("accept");
    expect(key("?")).toBe("help");
    expect(key("\\")).toBe("togglePanel");
    expect(key("Escape")).toBe("escape");
    expect(key("x")).toBeNull();
  });

  it("never takes letters typed in the document, a field or a menu", () => {
    expect(key("j", {}, [".superdoc"])).toBeNull();
    expect(key("a", {}, ['[contenteditable="true"]'])).toBeNull();
    expect(key("s", {}, ["input"])).toBeNull();
    expect(key("r", {}, ['[role="dialog"]'])).toBeNull();
  });

  it("Ctrl/⌘+S saves everywhere, other modifier combinations are left alone", () => {
    expect(key("s", { ctrlKey: true }, [".superdoc"])).toBe("save");
    expect(key("S", { metaKey: true })).toBe("save");
    expect(key("j", { ctrlKey: true })).toBeNull();
    expect(key("a", { altKey: true })).toBeNull();
  });
});
