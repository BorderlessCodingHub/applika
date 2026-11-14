import { describe, expect, it } from "vitest";

import { formatNumber } from "./format-number";

describe("formatNumber", () => {
  it("keeps the plain English digits", () => {
    expect(formatNumber(1234.5, "en")).toBe("1234.5");
    expect(formatNumber(12.345, "en", 1)).toBe("12.3");
    expect(formatNumber(20, "en", 1)).toBe("20.0");
  });

  it("writes Portuguese with a decimal comma and dot grouping", () => {
    expect(formatNumber(1234.5, "pt-BR")).toBe("1.234,5");
    expect(formatNumber(12.345, "pt-BR", 1)).toBe("12,3");
    expect(formatNumber(20, "pt-BR", 1)).toBe("20,0");
    expect(formatNumber(7, "pt-BR")).toBe("7");
  });
});
