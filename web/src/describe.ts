import type { Cleaning, Place, QueryResult, ZoneInfo, ZoneStatus } from "./query";
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

export interface Advice {
  tone: Tone;
  /** Twemoji codepoint (see web/public/emoji/), e.g. "1f60a" for 😊. Rendered as an <img>,
   * not the literal character - native emoji fonts render blurry at this size on most platforms. */
  icon: string;
  sentence: string;
}

/**
 * One place the fix could be, as a card: its street, its zone and any street cleaning there,
 * so the answer above can be checked against the signs. `advice` is what the place would mean
 * on its own. The upcoming-cleaning clause stays out of it - it belongs once, in the headline.
 */
export interface Card {
  key: string;
  streetName: string | null;
  zone: ZoneChip | null;
  cleaning: { label: string; today: boolean } | null;
  advice: Advice;
}

export interface Display extends Advice {
  /** Plain, spoken recommendation. Anything checkable against the ground - street, zone
   * code, price - belongs on the cards below instead, keeping this skimmable. Upcoming street
   * cleaning is the exception, folded straight into this sentence since it's time-sensitive
   * enough to belong in the headline. */
  sentence: string;
  /** Every place the fix could be, nearest first. */
  cards: Card[];
  /** Whether every card means the same thing. A card then opens to its details; otherwise it
   * opens to its own advice, since that's what differs. */
  agree: boolean;
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

/** Builds the ZoneChip for a zone's card. A shared car has nothing to pay where its rental
 * can end, so those zones show no price. */
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

const CLEANING_TODAY: Advice = {
  tone: "danger",
  icon: "1f61f", // 😟
  sentence: "There's street cleaning here today — don't park here.",
};

/** For a place with no zone data. Outside the zones, where a rental can end is up to the
 * carsharing operator. */
function noInfoAdvice(vehicle: Vehicle): Advice {
  return {
    tone: "neutral",
    icon: "1f440", // 👀
    sentence:
      vehicle === "shared"
        ? "I don't have parking info for this spot — check your carsharing app before you end the rental here."
        : "I don't have parking info for this spot — better check the signs around you.",
  };
}

/** @example cleaningLabel({today:false, upcoming:{date:"2026-04-08", daysUntil:1}}) -> { label: "Street cleaning tomorrow", today: false } */
function cleaningLabel(cleaning: Cleaning): Card["cleaning"] {
  if (cleaning.today) return { label: "Street cleaning today", today: true };
  if (!cleaning.upcoming) return null;
  const { daysUntil } = cleaning.upcoming;
  return {
    label: `Street cleaning ${daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}`,
    today: false,
  };
}

/**
 * A place as a card, and the legal consequence of parking there: the advice and the price,
 * limit and hours behind it. Zone code and colour aren't part of it - two zones that cost the
 * same and allow the same stay mean the same thing. A place with no zone and no cleaning
 * today has no known rules, so its consequence is null and it can't contradict one that has.
 */
function cardOf(
  place: Place,
  index: number,
  vehicle: Vehicle,
): { card: Card; consequence: string | null } {
  const chip = place.zone ? chipForZoneStatus(place.zone, vehicle) : null;
  // No Pay button where parking isn't allowed today.
  const zone = chip && place.cleaning.today ? { ...chip, payment: null } : chip;
  const known = place.cleaning.today || place.zone !== null;
  const advice = place.cleaning.today
    ? CLEANING_TODAY
    : place.zone
      ? adviceFor(place.zone, vehicle)
      : noInfoAdvice(vehicle);
  return {
    card: {
      key: place.zone?.code ?? (place.streetName ? `street:${place.streetName}` : `place:${index}`),
      streetName: place.streetName,
      zone,
      cleaning: cleaningLabel(place.cleaning),
      advice,
    },
    // On a cleaning day the zone's price no longer matters: parking isn't allowed at all.
    consequence: !known
      ? null
      : JSON.stringify([advice.sentence, place.cleaning.today ? null : (zone?.expanded ?? null)]),
  };
}

/**
 * The upcoming-cleaning clause for the headline, from the soonest date across the places. It
 * says "possible" when only some of the places have it.
 *
 * @example upcomingClause([{...cleaning: {today:false, upcoming:{date:"2026-04-08", daysUntil:1}}}]) -> " And watch out, street cleaning tomorrow."
 */
function upcomingClause(places: Place[]): string {
  const upcoming = places.map((p) => p.cleaning.upcoming);
  const soonest = upcoming.reduce<Cleaning["upcoming"]>(
    (a, b) => (b && (!a || b.daysUntil < a.daysUntil) ? b : a),
    null,
  );
  if (!soonest) return "";
  const when = soonest.daysUntil === 1 ? "tomorrow" : `in ${soonest.daysUntil} days`;
  return upcoming.every(Boolean)
    ? ` And watch out, street cleaning ${when}.`
    : ` And watch out, possible street cleaning ${when}.`;
}

/**
 * Maps a query result to what the UI shows: every place as a card, and a headline over them.
 * When every place with known rules has the same consequence, the headline is that advice,
 * taken from the nearest one. When they differ, the headline says so and each card carries
 * its own. Sentences read as plain, spoken advice; specifics belong on the cards, with one
 * exception - upcoming street cleaning is time-sensitive enough to earn a spot in the
 * headline, unless there's cleaning today. For a shared car, zone advice is about where the
 * rental can end.
 */
export function describe(result: QueryResult, vehicle: Vehicle = "own"): Display {
  if (result.kind === "outOfArea") {
    return {
      tone: "outside",
      icon: "1f9ed", // 🧭
      sentence: "This app only covers Prague — looks like you're somewhere else.",
      cards: [],
      agree: true,
    };
  }

  const described = result.places.map((place, i) => cardOf(place, i, vehicle));
  const consequences = new Set(described.flatMap((d) => (d.consequence ? [d.consequence] : [])));
  const agree = consequences.size <= 1;
  const cleaningToday = result.places.some((p) => p.cleaning.today);
  const headline: Advice = agree
    ? (described.find((d) => d.consequence)?.card.advice ?? noInfoAdvice(vehicle))
    : cleaningToday
      ? {
          tone: "danger",
          icon: "1f61f", // 😟
          sentence: "Where are you exactly? Some of these have street cleaning today.",
        }
      : {
          tone: "caution",
          icon: "1f9d0", // 🧐
          sentence: "Where are you exactly? Seems like one of these.",
        };
  const clause = agree && cleaningToday ? "" : upcomingClause(result.places);

  return {
    ...headline,
    sentence: `${headline.sentence}${clause}`,
    // A place with nothing to show - no street, zone or cleaning - has no card.
    cards: described
      .map((d) => d.card)
      .filter((card) => card.streetName || card.zone || card.cleaning),
    agree,
  };
}
