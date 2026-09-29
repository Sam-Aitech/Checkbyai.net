import { describe, expect, it, vi } from "vitest";
import {
  formatForensicSseEvent,
  loadAdminForensicContext,
} from "../adminForensicAnalysis";

describe("loadAdminForensicContext", () => {
  it("continues when the global AI rules schema is unavailable", async () => {
    const onWarning = vi.fn();

    const context = await loadAdminForensicContext(
      63,
      {
        globalRules: async () => {
          throw new Error('column "created_by" does not exist');
        },
        trustedPatterns: async () => [{ id: 4 }],
        hitlKnowledge: async () => [{ id: 8 }],
      },
      onWarning,
    );

    expect(context).toEqual({
      globalRules: [],
      trustedPatterns: [{ id: 4 }],
      hitlKnowledge: [{ id: 8 }],
      warnings: ["global_ai_rules"],
    });
    expect(onWarning).toHaveBeenCalledWith(
      expect.objectContaining({ source: "global_ai_rules" }),
    );
  });

  it("loads all optional knowledge sources concurrently", async () => {
    const context = await loadAdminForensicContext(63, {
      globalRules: async () => [{ id: 1 }],
      trustedPatterns: async () => [{ id: 2 }],
      hitlKnowledge: async () => [{ id: 3 }],
    });

    expect(context.warnings).toEqual([]);
    expect(context.globalRules).toEqual([{ id: 1 }]);
    expect(context.trustedPatterns).toEqual([{ id: 2 }]);
    expect(context.hitlKnowledge).toEqual([{ id: 3 }]);
  });
});

describe("formatForensicSseEvent", () => {
  it("emits a complete successful terminal event", () => {
    expect(formatForensicSseEvent({ done: true })).toBe(
      'data: {"done":true}\n\n',
    );
  });

  it("emits a structured retryable terminal error", () => {
    const event = formatForensicSseEvent({
      error: "AI stream failed",
      code: "AI_STREAM_FAILED",
      retryable: true,
      done: true,
    });

    expect(event).toContain('"code":"AI_STREAM_FAILED"');
    expect(event).toContain('"retryable":true');
    expect(event).toContain('"done":true');
    expect(event.endsWith("\n\n")).toBe(true);
  });
});