import { describe, expect, it } from "vitest";
import { getHeadspaceCameraBasis, getHeadspaceHingeAxis } from "./headspaceTransform";

describe("headspace transforms", () => {
  it("keeps the headspace tilt hinge parallel to the battle tabletop for all facings", () => {
    for (let facing = 0; facing < 6; facing += 1) {
      const hinge = getHeadspaceHingeAxis(facing);
      expect(hinge.y).toBeCloseTo(0);
      expect(hinge.length()).toBeCloseTo(1);
    }
  });

  it("derives camera direction only from hunter facing and camera pitch", () => {
    const first = getHeadspaceCameraBasis(2, 18);
    const second = getHeadspaceCameraBasis(2, 18);
    expect(first.direction.toArray()).toEqual(second.direction.toArray());
    expect(first.direction.dot(first.up)).toBeCloseTo(0);
    expect(first.direction.length()).toBeCloseTo(1);
    expect(first.up.length()).toBeCloseTo(1);
  });
});
