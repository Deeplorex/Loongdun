import { describe, expect, it } from "vitest";
import type { AssetSummary } from "../types";
import { addDaysIso, collectExpiringAssets, daysUntil, expiryState, todayIso } from "./expiry";

const TODAY = "2026-10-24";

function asset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: "asset-1",
    kind: "web_account",
    title: "示例凭证",
    platform: "",
    usernameHint: "",
    environment: "",
    favorite: false,
    updatedAt: "2026-10-01T00:00:00Z",
    tags: [],
    coreFields: [],
    ...overrides,
  };
}

describe("todayIso", () => {
  it("returns the local calendar date in the stored YYYY-MM-DD shape", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDaysIso", () => {
  it("rolls over month and year boundaries", () => {
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2026-10-24", 7)).toBe("2026-10-31");
  });
});

describe("daysUntil", () => {
  it("counts whole days between dates", () => {
    expect(daysUntil("2026-10-24", TODAY)).toBe(0);
    expect(daysUntil("2026-10-31", TODAY)).toBe(7);
    expect(daysUntil("2026-10-20", TODAY)).toBe(-4);
  });
});

describe("expiryState", () => {
  it("treats missing dates as healthy", () => {
    expect(expiryState(null, TODAY, 7)).toBeNull();
    expect(expiryState(undefined, TODAY, 7)).toBeNull();
  });

  it("flags dates that have already passed as expired", () => {
    expect(expiryState("2026-10-23", TODAY, 7)).toBe("expired");
  });

  it("treats today as expiring, not expired", () => {
    expect(expiryState(TODAY, TODAY, 7)).toBe("expiring");
  });

  it("flags the last day of the reminder window and passes beyond it", () => {
    expect(expiryState("2026-10-31", TODAY, 7)).toBe("expiring");
    expect(expiryState("2026-11-01", TODAY, 7)).toBeNull();
  });

  it("keeps flagging expired dates when the reminder window is off", () => {
    expect(expiryState("2026-10-20", TODAY, 0)).toBe("expired");
    expect(expiryState("2026-10-31", TODAY, 0)).toBeNull();
  });
});

describe("collectExpiringAssets", () => {
  it("returns live assets that are expired or inside the window, oldest first", () => {
    const rows = [
      asset({ id: "future", expiresAt: "2026-12-01" }),
      asset({ id: "expiring", expiresAt: "2026-10-30" }),
      asset({ id: "today", expiresAt: TODAY }),
      asset({ id: "expired", expiresAt: "2026-10-01" }),
      asset({ id: "trashed", expiresAt: "2026-10-01", deletedAt: "2026-10-02T00:00:00Z" }),
      asset({ id: "no-expiry" }),
    ];
    expect(collectExpiringAssets(rows, TODAY, 7).map((item) => item.id)).toEqual([
      "expired",
      "today",
      "expiring",
    ]);
  });

  it("returns nothing when the reminder window is disabled", () => {
    const rows = [asset({ id: "today", expiresAt: TODAY })];
    expect(collectExpiringAssets(rows, TODAY, 0)).toEqual([]);
  });
});
