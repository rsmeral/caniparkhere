import type { Status, UpcomingClosure } from "./query";

export type Tone = "neutral" | "good" | "warn" | "caution" | "danger";

export interface Display {
  tone: Tone;
  emoji: string;
  sentence: string;
  warning: string | null;
}

/** @example upcomingWarning({date:"2026-04-07", daysUntil:2, streetName:"Foo"}) -> "Heads up: street cleaning on Foo in 2 days." */
function upcomingWarning(upcoming: UpcomingClosure | null): string | null {
  if (!upcoming) return null;
  const when = upcoming.daysUntil === 1 ? "tomorrow" : `in ${upcoming.daysUntil} days`;
  const where = upcoming.streetName ? ` on ${upcoming.streetName}` : "";
  return `Heads up: street cleaning${where} ${when}.`;
}

/** Maps a query result to what the UI shows. A closure today suppresses the upcoming-closure warning (redundant). */
export function describe(status: Status, upcoming: UpcomingClosure | null = null): Display {
  const warning = status.kind === "closure" ? null : upcomingWarning(upcoming);

  switch (status.kind) {
    case "closure":
      return {
        tone: "danger",
        emoji: "😟",
        sentence: `Street cleaning today${status.streetName ? ` on ${status.streetName}` : ""} — don't park here.`,
        warning: null,
      };
    case "paidZone": {
      const cap = status.dailyCapCzk ? ` (max ${status.dailyCapCzk} Kč)` : "";
      return {
        tone: "warn",
        emoji: "🙂",
        sentence: `Paid zone: ${status.pricePerHour} Kč/hod${cap} until ${status.until}.`,
        warning,
      };
    }
    case "residentZone":
      return {
        tone: "caution",
        emoji: "🤔",
        sentence: "Resident-only zone — you may need a permit.",
        warning,
      };
    case "freeZoneRightNow":
      return {
        tone: "good",
        emoji: "😊",
        sentence: "You're in a paid zone, but it's free right now.",
        warning,
      };
    case "clear":
      return {
        tone: "good",
        emoji: "😊",
        sentence: "Looks clear — no restrictions found here.",
        warning,
      };
  }
}
