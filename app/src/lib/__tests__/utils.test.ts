import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn (className utility)", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    const result = cn("px-2 py-1", "px-4");
    expect(result).toBe("py-1 px-4");
  });

  it("handles undefined and null values", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("handles empty string", () => {
    expect(cn("", "class")).toBe("class");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});
