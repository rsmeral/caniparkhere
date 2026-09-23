import type { Status, UpcomingClosure, ZoneInfo } from "./query";

export type Tone = "neutral" | "good" | "warn" | "caution" | "danger" | "outside";

export interface ZonePayment {
  url: string;
  /** Short price label for the Pay button itself, e.g. "40 Kč/hod". */
  priceLabel: string;
}

export interface ZoneChip {
  code: string;
  /** Friendly English label for the category, e.g. "Visitors". */
  categoryLabel: string;
  colorHex: string;
  /** Prague's real curb-paint color name for this category (modrá/fialová/oranžová) -
   * shown as the color dot's tooltip so it's checkable against what's painted on the curb. */
  colorName: string;
  /** Deep link to pay for this zone (parkujvpraze.cz), when the zone is currently a paid one. */
  payment: ZonePayment | null;
  /** Extra rows (price/cap/hours) revealed when the card is tapped - null when there's
   * nothing beyond what's already in the summary row (e.g. a resident zone). */
  expanded: { label: string; value: string }[] | null;
}

export interface Detail {
  streetName: string | null;
  zone: ZoneChip | null;
}

export interface Display {
  tone: Tone;
  /** Twemoji codepoint (see web/public/emoji/), e.g. "1f60a" for 😊. Rendered as an <img>,
   * not the literal character - native emoji fonts render blurry at this size on most platforms. */
  icon: string;
  /** Plain, spoken recommendation. Anything checkable against the ground - street, zone
   * code, price - belongs in the detail card below instead, keeping this skimmable. An
   * upcoming street-cleaning closure is the exception, folded straight into this sentence
   * since it's time-sensitive enough to belong in the headline. */
  sentence: string;
  /** Lower-priority "here's what we detected" card - street name and the zone's own
   * code/color, so the recommendation is checkable against what's actually on the ground. */
  detail: Detail | null;
}

// Prague's real curb/sign colors and friendly labels per zone category, independent of
// `tone` - this is "what you'd see painted there", not the recommendation's urgency.
const ZONE_CATEGORY: Record<ZoneInfo["category"], { label: string; colorName: string; colorHex: string }> = {
  RES: { label: "Residents", colorName: "modrá", colorHex: "#2563eb" },
  MIX: { label: "Mixed", colorName: "fialová", colorHex: "#8b5cf6" },
  VIS: { label: "Visitors", colorName: "oranžová", colorHex: "#f97316" },
};

interface ZoneChipOptions {
  /** Present only for an actively-paid zone: drives both the Pay button and its price label. */
  payment?: { pricePerHour: number } | null;
  expanded?: ZoneChip["expanded"];
}

/** @example zoneChip({code:"P2-0237", category:"MIX"}, {}) -> { code:"P2-0237", categoryLabel:"Mixed", colorHex:"#8b5cf6", colorName:"fialová", payment:null, expanded:null } */
function zoneChip(zone: ZoneInfo, options: ZoneChipOptions = {}): ZoneChip {
  const { label, colorName, colorHex } = ZONE_CATEGORY[zone.category];
  return {
    code: zone.code,
    categoryLabel: label,
    colorHex,
    colorName,
    payment: options.payment
      ? {
          url: `https://platba.parkujvpraze.cz/pz/${zone.code}`,
          priceLabel: `${options.payment.pricePerHour} Kč/hod`,
        }
      : null,
    expanded: options.expanded ?? null,
  };
}

/** Builds the detail card, or null if there's nothing to show (no street, no zone). */
function detailOf(streetName: string | null, zone: ZoneChip | null): Detail | null {
  return streetName || zone ? { streetName, zone } : null;
}

/** @example upcomingClause({date:"2026-04-10", daysUntil:1, streetName:"Foo"}) -> " And watch out, street cleaning tomorrow." */
function upcomingClause(upcoming: UpcomingClosure): string {
  const when = upcoming.daysUntil === 1 ? "tomorrow" : `in ${upcoming.daysUntil} days`;
  return ` And watch out, street cleaning ${when}.`;
}

/**
 * Maps a query result to what the UI shows. A closure today, or being out of the app's
 * coverage area entirely, both suppress the upcoming-closure note (redundant either way).
 * Sentences read as plain, spoken advice; specifics belong in the detail card, with one
 * exception - an upcoming closure is time-sensitive enough to earn a spot in the headline.
 */
export function describe(status: Status, upcoming: UpcomingClosure | null = null): Display {
  const suppressUpcoming = status.kind === "closure" || status.kind === "outOfArea";
  const clause = !suppressUpcoming && upcoming ? upcomingClause(upcoming) : "";

  switch (status.kind) {
    case "outOfArea":
      return {
        tone: "outside",
        icon: "1f9ed", // 🧭
        sentence: "This app only covers Prague — looks like you're somewhere else.",
        detail: null,
      };
    case "closure":
      return {
        tone: "danger",
        icon: "1f61f", // 😟
        sentence: "There's street cleaning here today — don't park here.",
        detail: detailOf(status.streetName, null),
      };
    case "paidZone": {
      return {
        tone: "warn",
        icon: "1f642", // 🙂
        sentence: `You can park here, but it's paid.${clause}`,
        detail: detailOf(
          status.streetName,
          zoneChip(status, {
            payment: { pricePerHour: status.pricePerHour },
            expanded: [
              { label: "Price", value: `${status.pricePerHour} Kč/hod` },
              { label: "Daily cap", value: status.dailyCapCzk ? `${status.dailyCapCzk} Kč` : "No cap" },
              { label: "Hours", value: `${status.from}–${status.until}` },
            ],
          }),
        ),
      };
    }
    case "residentZone":
      return {
        tone: "caution",
        icon: "1f914", // 🤔
        sentence: `This is a resident-only zone, so you might need a permit to park here.${clause}`,
        detail: detailOf(status.streetName, zoneChip(status)),
      };
    case "freeZoneRightNow":
      return {
        tone: "good",
        icon: "1f60a", // 😊
        sentence: `You're in a paid zone, but right now it's free to park.${clause}`,
        detail: detailOf(status.streetName, zoneChip(status)),
      };
    case "clear":
      return {
        tone: "neutral",
        icon: "1f440", // 👀
        sentence: `I don't have parking info for this spot — better check the signs around you.${clause}`,
        detail: detailOf(status.streetName, null),
      };
  }
}
