import { describe, expect, it } from "vitest";
import { clampTuningValue, DEFAULT_SCENE_TUNING, SCENE_TUNING_FIELDS } from "./tuning";

describe("scene tuning", () => {
  it("keeps every default inside its editable range", () => {
    SCENE_TUNING_FIELDS.forEach((field) => {
      expect(DEFAULT_SCENE_TUNING[field.key]).toBeGreaterThanOrEqual(field.min);
      expect(DEFAULT_SCENE_TUNING[field.key]).toBeLessThanOrEqual(field.max);
    });
  });

  it("clamps extreme and invalid values", () => {
    const scale = SCENE_TUNING_FIELDS.find((field) => field.key === "headspaceScale")!;
    expect(clampTuningValue(scale, -99)).toBe(scale.min);
    expect(clampTuningValue(scale, 99)).toBe(scale.max);
    expect(clampTuningValue(scale, Number.NaN)).toBe(DEFAULT_SCENE_TUNING.headspaceScale);
  });
});
