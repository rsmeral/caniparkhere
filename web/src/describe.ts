import type { Cleaning, Place, QueryResult, ZoneInfo, ZoneStatus } from "./query";
import type { Change } from "./tariffLogic";
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
  /** The emoji itself, e.g. "😊". Shown as its Twemoji image, via emojiUrl. */
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
  /** The terms that set this place apart, e.g. "Free until 08:00". */
  terms: string | null;
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
    icon: "🤑",
    sentence: "You can park here, but it's paid.",
  },
  residentZone: {
    tone: "caution",
    icon: "🤔",
    sentence: "This is a resident-only zone, so you might need a permit to park here.",
  },
  freeZoneRightNow: {
    tone: "good",
    icon: "😊",
    sentence: "You're in a paid zone, but right now it's free to park.",
  },
};

/** @example formatStay(60) -> "1 hour"; formatStay(180) -> "3 hours"; formatStay(90) -> "90 minutes" */
function formatStay(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** @example formatStayShort(60) -> "1 h"; formatStayShort(90) -> "90 min" */
function formatStayShort(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * @example formatChange({time:"08:00", daysAhead:1, weekday:3, minutesUntil:600}) -> "tomorrow 08:00"
 * @example formatChange({time:"00:00", daysAhead:1, weekday:3, minutesUntil:300}) -> "midnight"
 */
function formatChange(change: Change): string {
  if (change.daysAhead === 1 && change.time === "00:00") return "midnight";
  if (change.daysAhead === 0) return change.time;
  if (change.daysAhead === 1) return `tomorrow ${change.time}`;
  return `${WEEKDAYS[change.weekday]} ${change.time}`;
}

// Free parking that ends sooner than this is worth saying so in the headline.
const SHORT_FREE_MINUTES = 60;

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
      icon: "🤑",
      sentence: `You can park here for ${stay}, but it's paid.`,
    };
  }
  if (
    status.kind === "freeZoneRightNow" &&
    status.paidFrom &&
    status.paidFrom.minutesUntil < SHORT_FREE_MINUTES
  ) {
    return {
      tone: "warn",
      icon: "⏰",
      sentence: `You can park here for free now, but not for long — it's paid from ${formatChange(status.paidFrom)}.`,
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
      icon: "😊",
      sentence: "You can end your rental here, for free and with no time limit.",
    };
  }
  return {
    tone: "caution",
    icon: "🤔",
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
  icon: "😟",
  sentence: "There's street cleaning here today — don't park here.",
};

/** For a place with no zone data. Outside the zones, where a rental can end is up to the
 * carsharing operator. */
function noInfoAdvice(vehicle: Vehicle): Advice {
  return {
    tone: "neutral",
    icon: "👀",
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

/** What paying to park costs, and for how long it's allowed. */
export interface PaidTerms {
  pricePerHour: number;
  dailyCapCzk: number | null;
  /** In minutes. "unknown" for a resident zone whose limit isn't in the data - it has one,
   * set on the sign - and null where the stay isn't limited. */
  maxStay: number | "unknown" | null;
  from: string;
  until: string;
}

/**
 * What parking at a place means legally: anything that changes the price or risks a fine.
 * The zone's code and colour aren't part of it - two zones that cost the same and allow the
 * same stay mean the same thing. A shared car's consequences are about where its rental can
 * end.
 */
export type Consequence =
  | { kind: "cleaningToday" }
  | { kind: "paid"; terms: PaidTerms }
  | { kind: "residentOnly" }
  | { kind: "freeNow"; paidFrom: Pick<Change, "time" | "daysAhead"> | null }
  | { kind: "canEndRental" }
  | { kind: "stopDuringRental"; terms: PaidTerms | null };

function paidTerms(zone: Extract<ZoneStatus, { kind: "paidZone" }>): PaidTerms {
  return {
    pricePerHour: zone.pricePerHour,
    dailyCapCzk: zone.dailyCapCzk,
    maxStay: zone.category === "RES" ? (zone.maxStayMinutes ?? "unknown") : null,
    from: zone.from,
    until: zone.until,
  };
}

/**
 * The consequence of parking at a place, or null when it has no known rules: no zone and no
 * cleaning today. Cleaning today outweighs the zone - parking isn't allowed at all.
 */
export function consequenceOf(place: Place, vehicle: Vehicle): Consequence | null {
  if (place.cleaning.today) return { kind: "cleaningToday" };
  const { zone } = place;
  if (!zone) return null;
  if (vehicle === "shared") {
    if (zone.category !== "VIS") return { kind: "canEndRental" };
    return { kind: "stopDuringRental", terms: zone.kind === "paidZone" ? paidTerms(zone) : null };
  }
  switch (zone.kind) {
    case "paidZone":
      return { kind: "paid", terms: paidTerms(zone) };
    case "residentZone":
      return { kind: "residentOnly" };
    case "freeZoneRightNow":
      return {
        kind: "freeNow",
        paidFrom: zone.paidFrom && { time: zone.paidFrom.time, daysAhead: zone.paidFrom.daysAhead },
      };
  }
}

function sameTerms(a: PaidTerms | null, b: PaidTerms | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.pricePerHour === b.pricePerHour &&
    a.dailyCapCzk === b.dailyCapCzk &&
    a.maxStay === b.maxStay &&
    a.from === b.from &&
    a.until === b.until
  );
}

export function sameConsequence(a: Consequence, b: Consequence): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "paid" && b.kind === "paid") return sameTerms(a.terms, b.terms);
  if (a.kind === "stopDuringRental" && b.kind === "stopDuringRental") {
    return sameTerms(a.terms, b.terms);
  }
  if (a.kind === "freeNow" && b.kind === "freeNow") {
    return a.paidFrom?.time === b.paidFrom?.time && a.paidFrom?.daysAhead === b.paidFrom?.daysAhead;
  }
  return true;
}

/**
 * A place's terms in a few words, for its card: when free parking ends; the price, when
 * paying ends and how long or how much it allows; or whether a shared car's rental can end
 * there. They're what tells one card from another without opening it.
 * On a cleaning day the card's cleaning mark says it all.
 */
function termsOf(place: Place, vehicle: Vehicle): string | null {
  const { zone } = place;
  if (!zone || place.cleaning.today) return null;
  if (vehicle === "shared") {
    return zone.category === "VIS" ? "Can't end rental here" : "Rental can end here";
  }
  switch (zone.kind) {
    case "residentZone":
      return "Permit needed";
    case "freeZoneRightNow":
      return zone.paidFrom ? `Free until ${formatChange(zone.paidFrom)}` : "Free at all hours";
    case "paidZone": {
      const price = `${zone.pricePerHour} Kč/h`;
      const paid = zone.paidUntil
        ? `${price} until ${formatChange(zone.paidUntil)}`
        : `${price} at all hours`;
      const limit =
        zone.category === "RES"
          ? zone.maxStayMinutes === null
            ? "limit on the sign"
            : `max ${formatStayShort(zone.maxStayMinutes)}`
          : zone.dailyCapCzk
            ? `max ${zone.dailyCapCzk} Kč/day`
            : null;
      return limit ? `${paid} · ${limit}` : paid;
    }
  }
}

/** A place as a card, with the advice it would get on its own. */
function cardOf(place: Place, index: number, vehicle: Vehicle): Card {
  const chip = place.zone ? chipForZoneStatus(place.zone, vehicle) : null;
  // No Pay button where parking isn't allowed today.
  const zone = chip && place.cleaning.today ? { ...chip, payment: null } : chip;
  const advice = place.cleaning.today
    ? CLEANING_TODAY
    : place.zone
      ? adviceFor(place.zone, vehicle)
      : noInfoAdvice(vehicle);
  return {
    key: place.zone?.code ?? (place.streetName ? `street:${place.streetName}` : `place:${index}`),
    streetName: place.streetName,
    zone,
    terms: termsOf(place, vehicle),
    cleaning: cleaningLabel(place.cleaning),
    advice,
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
      icon: "🧭",
      sentence: "This app only covers Prague — looks like you're somewhere else.",
      cards: [],
      agree: true,
    };
  }

  const cards = result.places.map((place, i) => cardOf(place, i, vehicle));
  // Places with no known rules can't contradict the others, so only the rest are compared.
  const known = result.places.flatMap((place, i) => {
    const consequence = consequenceOf(place, vehicle);
    return consequence ? [{ consequence, card: cards[i] }] : [];
  });
  const agree = known.every((k) => sameConsequence(k.consequence, known[0].consequence));
  const cleaningToday = result.places.some((p) => p.cleaning.today);
  const headline: Advice = agree
    ? (known[0]?.card.advice ?? noInfoAdvice(vehicle))
    : cleaningToday
      ? {
          tone: "danger",
          icon: "😟",
          sentence: "Where are you exactly? Some of these have street cleaning today.",
        }
      : {
          tone: "caution",
          icon: "🧐",
          sentence: "Where are you exactly? Seems like one of these.",
        };
  const clause = agree && cleaningToday ? "" : upcomingClause(result.places);

  return {
    ...headline,
    sentence: `${headline.sentence}${clause}`,
    // A place with nothing to show - no street, zone or cleaning - has no card.
    cards: cards.filter((card) => card.streetName || card.zone || card.cleaning),
    agree,
  };
}
