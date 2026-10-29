import { describe, expect, it } from "vitest";
import { formatStudentName, matchKnownName } from "./student-name";

describe("student names", () => {
  it("are written as “Alex Suti”, whatever the case they came in", () => {
    expect(formatStudentName("ALEX SUTI")).toBe("Alex Suti");
    expect(formatStudentName("alex suti")).toBe("Alex Suti");
    expect(formatStudentName("  aLEX   suti ")).toBe("Alex Suti");
    expect(formatStudentName("YANKEE")).toBe("Yankee");
    expect(formatStudentName("Alex Suti")).toBe("Alex Suti");
  });

  it("split names joined in a file name, but keep names written that way on purpose", () => {
    expect(formatStudentName("AlexSuti")).toBe("Alex Suti");
    expect(formatStudentName("AlphaBravoCharlie")).toBe("Alpha Bravo Charlie");
    expect(formatStudentName("McDonald")).toBe("McDonald");
    expect(formatStudentName("DeAndre KILO")).toBe("DeAndre Kilo");
    expect(formatStudentName("alex_suti")).toBe("Alex Suti");
  });

  it("hyphens, apostrophes, small connecting words, initials and other scripts", () => {
    expect(formatStudentName("ANNE-MARIE o'neil")).toBe("Anne-Marie O'Neil");
    expect(formatStudentName("JAN VAN DER BERG")).toBe("Jan van der Berg");
    expect(formatStudentName("AHMAD BIN TANGO")).toBe("Ahmad bin Tango");
    expect(formatStudentName("a. kilo")).toBe("A. Kilo");
    expect(formatStudentName("王小明")).toBe("王小明");
    expect(formatStudentName("")).toBeNull();
    expect(formatStudentName(null)).toBeNull();
  });

  it("a name from a file name takes the fuller name of the same student already in the app", () => {
    expect(matchKnownName("Alex Suti", ["Alex Suti Delta", "Bravo"])).toBe("Alex Suti Delta");
    expect(matchKnownName("Alex Suti", ["alex suti delta", "ALEX SUTI DELTA"])).toBe("Alex Suti Delta"); // one student, written twice
    expect(matchKnownName("Alex", ["Alex Suti", "Alex Kilo"])).toBe("Alex"); // two different students: no guess
    expect(matchKnownName("Bravo", ["Kilo"])).toBe("Bravo");
    expect(matchKnownName("Al", ["Alex Suti"])).toBe("Al"); // too short to match safely
  });
});
