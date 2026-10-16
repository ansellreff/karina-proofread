import { describe, expect, it } from "vitest";
import { parseFontName } from "./pdf-to-docx";

describe("PDF font names", () => {
  it("maps embedded font names to Word font names, with bold and italic", () => {
    expect(parseFontName("ABCDEF+TimesNewRomanPSMT")).toEqual({ family: "Times New Roman", bold: false, italic: false });
    expect(parseFontName("ABCDEF+TimesNewRomanPS-BoldItalicMT")).toEqual({ family: "Times New Roman", bold: true, italic: true });
    expect(parseFontName("Calibri-Bold")).toEqual({ family: "Calibri", bold: true, italic: false });
    expect(parseFontName("ArialMT")).toEqual({ family: "Arial", bold: false, italic: false });
    expect(parseFontName("QWERTY+OpenSans-SemiBold").family).toBe("Open Sans");
    expect(parseFontName("BookAntiqua,Italic")).toEqual({ family: "Book Antiqua", bold: false, italic: true });
  });
});
