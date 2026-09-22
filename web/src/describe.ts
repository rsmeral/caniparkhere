import type { Status, UpcomingClosure, ZoneInfo } from "./query";

export type Tone = "neutral" | "good" | "warn" | "caution" | "danger" | "outside";

export interface Detail {
  text: string;
  colorHex: string;
}

export interface Display {
  tone: Tone;
  /** Twemoji codepoint (see web/public/emoji/), e.g. "1f60a" for 😊. Rendered as an <img>,
   * not the literal character - native emoji fonts render blurry at this size on most platforms. */
  icon: string;
  sentence: string;
  warning: string | null;
  /** Lower-priority "here's what we detected" line - the zone's own code/color, so the
   * recommendation is checkable against what's actually painted on the curb. */
  detail: Detail | null;
}

// Prague's real curb/sign colors per zone category (modrá/fialová/oranžová), independent
// of `tone` - this is "what you'd see painted there", not the recommendation's urgency.
const ZONE_COLOR: Record<ZoneInfo["category"], Detail> = {
  RES: { text: "resident zone (modrá)", colorHex: "#2563eb" },
  MIX: { text: "mixed zone (fialová)", colorHex: "#8b5cf6" },
  VIS: { text: "visitor zone (oranžová)", colorHex: "#f97316" },
};

/** @example zoneDetail({code:"P2-0237", category:"MIX"}) -> { text: "Zone P2-0237 — mixed zone (fialová)", colorHex: "#8b5cf6" } */
function zoneDetail(zone: ZoneInfo): Detail {
  const { text, colorHex } = ZONE_COLOR[zone.category];
  return { text: `Zone ${zone.code} — ${text}`, colorHex };
}

/** @example upcomingWarning({date:"2026-04-07", daysUntil:2, streetName:"Foo"}) -> "Heads up: street cleaning on Foo in 2 days." */
function upcomingWarning(upcoming: UpcomingClosure | null): string | null {
  if (!upcoming) return null;
  const when = upcoming.daysUntil === 1 ? "tomorrow" : `in ${upcoming.daysUntil} days`;
  const where = upcoming.streetName ? ` on ${upcoming.streetName}` : "";
  return `Heads up: street cleaning${where} ${when}.`;
}

/**
 * Maps a query result to what the UI shows. A closure today, or being out of the app's
 * coverage area entirely, both suppress the upcoming-closure warning (redundant either way).
 */
export function describe(status: Status, upcoming: UpcomingClosure | null = null): Display {
  const warning =
    status.kind === "closure" || status.kind === "outOfArea" ? null : upcomingWarning(upcoming);

  switch (status.kind) {
    case "outOfArea":
      return {
        tone: "outside",
        icon: "1f9ed", // 🧭
        sentence: "This app only covers Prague — looks like you're somewhere else.",
        warning: null,
        detail: null,
      };
    case "closure":
      return {
        tone: "danger",
        icon: "1f61f", // 😟
        sentence: `Street cleaning today${status.streetName ? ` on ${status.streetName}` : ""} — don't park here.`,
        warning: null,
        detail: null,
      };
    case "paidZone": {
      const cap = status.dailyCapCzk ? ` (max ${status.dailyCapCzk} Kč)` : "";
      return {
        tone: "warn",
        icon: "1f642", // 🙂
        sentence: `Paid zone: ${status.pricePerHour} Kč/hod${cap} until ${status.until}.`,
        warning,
        detail: zoneDetail(status),
      };
    }
    case "residentZone":
      return {
        tone: "caution",
        icon: "1f914", // 🤔
        sentence: "Resident-only zone — you may need a permit.",
        warning,
        detail: zoneDetail(status),
      };
    case "freeZoneRightNow":
      return {
        tone: "good",
        icon: "1f60a", // 😊
        sentence: "You're in a paid zone, but it's free right now.",
        warning,
        detail: zoneDetail(status),
      };
    case "clear":
      return {
        tone: "good",
        icon: "1f60a", // 😊
        sentence: "Looks clear — no restrictions found here.",
        warning,
        detail: null,
      };
  }
}
