import { describe, expect, it } from "vitest";
import { QUOTE_COUNTER_START, formatQuoteNumber, nextQuoteCounter } from "@/lib/quote-number";

describe("nextQuoteCounter", () => {
  it("starts at START + 1 for a new store", () => {
    expect(nextQuoteCounter(undefined)).toBe(QUOTE_COUNTER_START + 1);
    expect(nextQuoteCounter(null)).toBe(QUOTE_COUNTER_START + 1);
    expect(nextQuoteCounter(QUOTE_COUNTER_START)).toBe(1001);
  });

  it("increments an existing counter", () => {
    expect(nextQuoteCounter(1001)).toBe(1002);
    expect(nextQuoteCounter(4999)).toBe(5000);
  });

  it("never goes below the start value, even for corrupt data", () => {
    expect(nextQuoteCounter(5)).toBe(1001);
    expect(nextQuoteCounter(-1)).toBe(1001);
    expect(nextQuoteCounter(Number.NaN)).toBe(1001);
    expect(nextQuoteCounter(1001.7)).toBe(1002);
  });
});

describe("formatQuoteNumber", () => {
  it("joins prefix and counter", () => {
    expect(formatQuoteNumber("JR", 1001)).toBe("JR-1001");
  });

  it("normalizes the prefix", () => {
    expect(formatQuoteNumber("jr", 1001)).toBe("JR-1001");
    expect(formatQuoteNumber("j r!", 1001)).toBe("JR-1001");
    expect(formatQuoteNumber("ABCDEFGHIJ", 1001)).toBe("ABCDEFGH-1001");
    expect(formatQuoteNumber("", 1001)).toBe("Q-1001");
  });
});
