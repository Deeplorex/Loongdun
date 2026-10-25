import type { AssetSummary } from "../types";

export type ExpiryState = "expired" | "expiring";

/**
 * Local calendar date as YYYY-MM-DD. Expiry dates are stored as plain
 * YYYY-MM-DD text (from the editor's date input), so comparisons stay lexical
 * and use the user's own clock rather than UTC.
 */
export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, (day || 1) + days);
  const monthText = `${date.getMonth() + 1}`.padStart(2, "0");
  const dayText = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${monthText}-${dayText}`;
}

/** Whole days from `today` to `expiresAt` (negative once the date has passed). */
export function daysUntil(expiresAt: string, today: string): number {
  return Math.round(
    (Date.parse(`${expiresAt.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Expiry state of one asset: "expired" once the date has passed, "expiring"
 * when the date is today or within the reminder window (0 disables the
 * upcoming-expiry half but never the expired half).
 */
export function expiryState(
  expiresAt: string | null | undefined,
  today: string,
  reminderDays: number,
): ExpiryState | null {
  if (!expiresAt) return null;
  if (expiresAt.slice(0, 10) < today) return "expired";
  if (reminderDays > 0 && expiresAt.slice(0, 10) <= addDaysIso(today, reminderDays)) {
    return "expiring";
  }
  return null;
}

/** Live (non-trashed) assets that are expired or inside the reminder window. */
export function collectExpiringAssets(
  assets: AssetSummary[],
  today: string,
  reminderDays: number,
): AssetSummary[] {
  return assets
    .filter((asset) => !asset.deletedAt && expiryState(asset.expiresAt, today, reminderDays))
    .sort((left, right) => (left.expiresAt || "9999").localeCompare(right.expiresAt || "9999"));
}
