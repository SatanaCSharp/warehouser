import { describe, it, expect } from "vitest";
import { paginate } from "./pagination.js";

describe("paginate", () => {
  it("slices data and returns metadata", () => {
    const items = [1, 2, 3, 4, 5];
    const result = paginate(items, { page: 2, limit: 2 });
    expect(result.data).toEqual([3, 4]);
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
  });

  it("defaults page to 1 and limit to 20", () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const result = paginate(items, {});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(5);
  });
});
