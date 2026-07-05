import { describe, it, expect } from "vitest";
import { calcNetStock } from "./stock.js";
import { MovementType } from "@warehouser/shared-types";

describe("calcNetStock", () => {
  it("adds in-movements and subtracts out-movements", () => {
    const movements = [
      { type: MovementType.In, quantity: 10 },
      { type: MovementType.In, quantity: 5 },
      { type: MovementType.Out, quantity: 3 }
    ];
    expect(calcNetStock(movements)).toBe(12);
  });

  it("counts transfer as neither in nor out", () => {
    const movements = [
      { type: MovementType.In, quantity: 10 },
      { type: MovementType.Transfer, quantity: 5 }
    ];
    expect(calcNetStock(movements)).toBe(10);
  });

  it("returns 0 for empty array", () => {
    expect(calcNetStock([])).toBe(0);
  });
});
