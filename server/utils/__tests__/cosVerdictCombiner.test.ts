import { describe, expect, test } from "vitest";
import { combineWithCosVerdict } from "../cosVerdictCombiner";

describe("combineWithCosVerdict", () => {
  test("GENUINE cosCheck overrides a disagreeing pattern result", () => {
    const combined = combineWithCosVerdict("suspicious", 60, "GENUINE");
    expect(combined.result).toBe("genuine");
    expect(combined.confidence).toBe(85);
  });

  test("GENUINE cosCheck overrides a fake pattern result", () => {
    const combined = combineWithCosVerdict("fake", 10, "GENUINE");
    expect(combined.result).toBe("genuine");
    expect(combined.confidence).toBe(85);
  });

  test("GENUINE cosCheck does not lower an already-higher pattern confidence", () => {
    const combined = combineWithCosVerdict("suspicious", 92, "GENUINE");
    expect(combined.result).toBe("genuine");
    expect(combined.confidence).toBe(92);
  });

  test("GENUINE cosCheck agreeing with an already-genuine pattern result is a no-op", () => {
    const combined = combineWithCosVerdict("genuine", 75, "GENUINE");
    expect(combined.result).toBe("genuine");
    expect(combined.confidence).toBe(75);
  });

  test("EDITED cosCheck downgrades a genuine pattern result to suspicious", () => {
    const combined = combineWithCosVerdict("genuine", 90, "EDITED");
    expect(combined.result).toBe("suspicious");
    expect(combined.confidence).toBe(50);
  });

  test("EDITED cosCheck does not raise an already-lower confidence", () => {
    const combined = combineWithCosVerdict("genuine", 30, "EDITED");
    expect(combined.result).toBe("suspicious");
    expect(combined.confidence).toBe(30);
  });

  // Regression guard: this is the exact case the PR fixed. Before, EDITED
  // against a non-genuine pattern result fell through to the `else` branch
  // and returned the pattern result completely unmodified — silently
  // discarding real signal that the COS check found tampering.
  test("EDITED cosCheck against a suspicious pattern result leaves it suspicious", () => {
    const combined = combineWithCosVerdict("suspicious", 55, "EDITED");
    expect(combined.result).toBe("suspicious");
    expect(combined.confidence).toBe(55);
  });

  test("EDITED cosCheck against a fake pattern result leaves it fake", () => {
    const combined = combineWithCosVerdict("fake", 5, "EDITED");
    expect(combined.result).toBe("fake");
    expect(combined.confidence).toBe(5);
  });
});
