import type { Status, UpcomingClosure, ZoneInfo, ZoneStatus } from "./query";
import type { Vehicle } from "./vehicle";

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

/**
 * A candidate for an ambiguous location: the zone's chip and the street it's on, plus the
 * advice that zone carries on its own. The card reveals that advice when tapped, so each
 * candidate can be read the way the main screen reads a confident answer. The
 * upcoming-closure clause stays out of these sentences - it belongs once, in the headline
 * above them.
 */
export interface CandidateZone extends ZoneChip {
  streetName: string | null;
  tone: Tone;
  icon: string;
  sentence: string;
}

export interface Detail {
  streetName: string | null;
  zone: ZoneChip | null;
  /** Set only when the location is ambiguous between multiple zones (zone and streetName are
   * null in that case) - every zone the GPS fix's accuracy radius could plausibly place you
   * in, each with its own street. */
  candidateZones: CandidateZone[] | null;
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
export const ZONE_CATEGORY: Record<ZoneInfo["category"], { label: string; colorName: string; colorHex: string }> = {
  RES: { label: "Residents", colorName: "modrá", colorHex: "#2563eb" },
  MIX: { label: "Mixed", colorName: "fialová", colorHex: "#8b5cf6" },
  VIS: { label: "Visitors", colorName: "oranžová", colorHex: "#f97316" },
};

// The tone, emoji and recommendation for each way a point can resolve to a single zone.
// Shared by the main screen's headline and by each candidate card an ambiguous location
// offers, so a candidate says exactly what it would say if the fix had landed on it alone.
const ZONE_ADVICE: Record<ZoneStatus["kind"], { tone: Tone; icon: string; sentence: string }> = {
  paidZone: {
    tone: "warn",
    icon: "1f642", // 🙂
    sentence: "You can park here, but it's paid.",
  },
  residentZone: {
    tone: "caution",
    icon: "1f914", // 🤔
    sentence: "This is a resident-only zone, so you might need a permit to park here.",
  },
  freeZoneRightNow: {
    tone: "good",
    icon: "1f60a", // 😊
    sentence: "You're in a paid zone, but right now it's free to park.",
  },
};

/** @example formatStay(60) -> "1 hour"; formatStay(180) -> "3 hours"; formatStay(90) -> "90 minutes" */
function formatStay(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

type Advice = { tone: Tone; icon: string; sentence: string };

/**
 * The advice for a zone status, as the headline or as a candidate card. A resident (blue)
 * zone while its tariff runs lets a visitor pay to stay, but only briefly: 1 to 3 hours,
 * set per district. The data usually says which; when it doesn't, the sign does.
 */
function adviceFor(status: ZoneStatus, vehicle: Vehicle): Advice {
  if (vehicle === "shared") return sharedAdviceFor(status);
  if (status.kind === "paidZone" && status.category === "RES") {
    const stay =
      status.maxStayMinutes === null ? "a short time" : `up to ${formatStay(status.maxStayMinutes)}`;
    return {
      tone: "warn",
      icon: "1f642", // 🙂
      sentence: `You can park here for ${stay}, but it's paid.`,
    };
  }
  return ZONE_ADVICE[status.kind];
}

/**
 * The advice for a zone status in a shared car. The carsharing permit covers blue and
 * purple zones at any hour, so a rental can end there. It doesn't cover orange zones: a
 * shared car can only stop there during the rental, and pays like any visitor.
 */
function sharedAdviceFor(status: ZoneStatus): Advice {
  if (status.category !== "VIS") {
    return {
      tone: "good",
      icon: "1f60a", // 😊
      sentence: "You can end your rental here, for free and with no time limit.",
    };
  }
  return {
    tone: "caution",
    icon: "1f914", // 🤔
    sentence:
      status.kind === "paidZone"
        ? "You can't end your rental here. You can stop here during the rental, but it's paid."
        : "You can't end your rental here. You can stop here during the rental, and right now it's free.",
  };
}

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
  return streetName || zone ? { streetName, zone, candidateZones: null } : null;
}

/** Builds the ZoneChip for a single resolved zone status - shared by the main switch below
 * and by each entry in an ambiguous location's candidate list. A shared car has nothing to
 * pay where its rental can end, so those zones show no price. */
function chipForZoneStatus(status: ZoneStatus, vehicle: Vehicle): ZoneChip {
  if (vehicle === "shared" && status.category !== "VIS") return zoneChip(status);
  if (status.kind === "paidZone") {
    const price = { label: "Price", value: `${status.pricePerHour} Kč/hod` };
    const hours = { label: "Hours", value: `${status.from}–${status.until}` };
    // A visitor's stay in a resident zone is capped by time rather than by a daily price.
    const limit =
      status.category === "RES"
        ? {
            label: "Max stay",
            value:
              status.maxStayMinutes === null
                ? "1–3 h, see sign"
                : formatStay(status.maxStayMinutes),
          }
        : { label: "Daily cap", value: status.dailyCapCzk ? `${status.dailyCapCzk} Kč` : "No cap" };
    return zoneChip(status, {
      payment: { pricePerHour: status.pricePerHour },
      expanded: [price, limit, hours],
    });
  }
  return zoneChip(status);
}

/** Builds one entry of an ambiguous location's candidate list. */
function candidateFor(status: ZoneStatus, vehicle: Vehicle): CandidateZone {
  return {
    ...chipForZoneStatus(status, vehicle),
    ...adviceFor(status, vehicle),
    streetName: status.streetName,
  };
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
 * For a shared car, zone advice is about where the rental can end.
 */
export function describe(
  status: Status,
  upcoming: UpcomingClosure | null = null,
  vehicle: Vehicle = "own",
): Display {
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
    case "paidZone":
    case "residentZone":
    case "freeZoneRightNow": {
      const advice = adviceFor(status, vehicle);
      return {
        ...advice,
        sentence: `${advice.sentence}${clause}`,
        detail: detailOf(status.streetName, chipForZoneStatus(status, vehicle)),
      };
    }
    case "clear": {
      // Outside the zones, where a rental can end is up to the carsharing operator.
      const sentence =
        vehicle === "shared"
          ? "I don't have parking info for this spot — check your carsharing app before you end the rental here."
          : "I don't have parking info for this spot — better check the signs around you.";
      return {
        tone: "neutral",
        icon: "1f440", // 👀
        sentence: `${sentence}${clause}`,
        detail: detailOf(status.streetName, null),
      };
    }
    case "ambiguous":
      return {
        tone: "caution",
        icon: "1f9d0", // 🧐
        sentence: `Your location isn't precise enough to tell exactly which zone you're in — could be any of these.${clause}`,
        detail: {
          streetName: null,
          zone: null,
          candidateZones: status.candidates.map((c) => candidateFor(c, vehicle)),
        },
      };
  }
}
