import type { TariffRule } from "./tariff.js";

/**
 * The parts of Golemio's parking API (https://api.golemio.cz/docs/public-openapi/) this
 * pipeline reads. TSK's paid parking zones are its `tsk_v2` source: one parking record per
 * zone section, whose id is `tsk2-` followed by the section's zone code, pointing at a
 * tariff by id.
 */
export interface GolemioParking {
  id: string;
  tariff: string | null;
}

const DAY_INDEX = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 } as const;

export interface GolemioPeriod {
  day_in_week: keyof typeof DAY_INDEX;
  /** "HH:MM:SS", within one calendar day: a window past midnight comes as two periods. */
  start: string;
  end: string;
  /** Whether the period applies on public holidays only, or on every other day. */
  ph: "PH_only" | "PH_off";
}

export interface GolemioCharge {
  /** Kč per `charge_interval` seconds for "other"; a total in Kč for "minimum"/"maximum". */
  charge: string;
  /** "other" is the running rate, "maximum" the most one stay costs within its periods,
   * and "minimum" the least a payment can be. */
  charge_type: "other" | "minimum" | "maximum";
  charge_interval: number | null;
  periods_of_time: GolemioPeriod[];
}

export interface GolemioTariff {
  id: string;
  charge_bands: {
    /** The longest a visitor may stay, in seconds, or null when there's no limit. */
    maximum_duration: number | null;
    charges: GolemioCharge[];
  }[];
}

const ZONE_ID_PREFIX = "tsk2-";

/**
 * The longest a visitor may stay in each zone section, in minutes, keyed by zone code.
 * Sections with no tariff or no limit are left out.
 *
 * @example maxStayMinutesByCode([{ id: "tsk2-P1-0101", tariff: "t" }], [{ id: "t", charge_bands: [{ maximum_duration: 3600 }] }]) -> Map { "P1-0101" => 60 }
 */
export function maxStayMinutesByCode(
  parkings: GolemioParking[],
  tariffs: GolemioTariff[],
): Map<string, number> {
  const tariffById = new Map(tariffs.map((t) => [t.id, t]));
  const result = new Map<string, number>();
  for (const parking of parkings) {
    if (!parking.id.startsWith(ZONE_ID_PREFIX) || parking.tariff === null) continue;
    const durations = (tariffById.get(parking.tariff)?.charge_bands ?? [])
      .map((band) => band.maximum_duration)
      .filter((d): d is number => d !== null && d > 0);
    // A tariff has one band per group of drivers it charges; a visitor is held to the
    // strictest of them.
    if (durations.length > 0) {
      result.set(parking.id.slice(ZONE_ID_PREFIX.length), Math.min(...durations) / 60);
    }
  }
  return result;
}

/** The Golemio tariff id of each zone section that has one, keyed by zone code. */
export function tariffIdByCode(parkings: GolemioParking[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const parking of parkings) {
    if (parking.id.startsWith(ZONE_ID_PREFIX) && parking.tariff !== null) {
      result.set(parking.id.slice(ZONE_ID_PREFIX.length), parking.tariff);
    }
  }
  return result;
}

/** @example toMinutes("08:30:00") -> 510 */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Turns a TSK tariff into the app's rules: one per paid window, with its days, hours,
 * hourly price and cap. Public holidays are left out, since the app doesn't know which
 * days they are; the rules describe every other day.
 *
 * A "maximum" becomes a rule's daily cap only when it's less than a stay could cost anyway,
 * across all the paid time it covers that day and within the longest stay allowed. Most
 * maximums are just that natural total, which isn't a cap worth showing.
 *
 * @example tariffRules({ id: "t", charge_bands: [{ maximum_duration: null, charges: [{ charge: "0.5", charge_type: "other", charge_interval: 60, periods_of_time: [{ day_in_week: "Mo", start: "08:00:00", end: "19:59:00", ph: "PH_off" }] }] }] })
 *   -> [{ days: [0], start: "08:00", end: "19:59", pricePerHour: 30, dailyCapCzk: null }]
 */
export function tariffRules(tariff: GolemioTariff): TariffRule[] {
  if (tariff.charge_bands.length !== 1) {
    throw new Error(`Golemio tariff ${tariff.id} has ${tariff.charge_bands.length} bands, not 1`);
  }
  const [band] = tariff.charge_bands;
  const longestStayHours = band.maximum_duration === null ? Infinity : band.maximum_duration / 3600;
  const everyday = (c: GolemioCharge) => c.periods_of_time.filter((p) => p.ph === "PH_off");

  const paid = band.charges
    .filter((c) => c.charge_type === "other" && c.charge_interval)
    .flatMap((c) =>
      everyday(c).map((p) => ({
        day: p.day_in_week,
        start: toMinutes(p.start),
        end: toMinutes(p.end),
        perHour: (Number(c.charge) * 3600) / c.charge_interval!,
      })),
    );
  const maximums = band.charges
    .filter((c) => c.charge_type === "maximum")
    .flatMap((c) =>
      everyday(c).map((p) => ({
        day: p.day_in_week,
        start: toMinutes(p.start),
        end: toMinutes(p.end),
        amount: Number(c.charge),
      })),
    );
  /** Whether a maximum is less than its paid time could cost without it. */
  const binds = (maximum: (typeof maximums)[number]) => {
    const covered = paid.filter(
      (p) => p.day === maximum.day && p.start >= maximum.start && p.end <= maximum.end,
    );
    const hours = covered.reduce((sum, p) => sum + (p.end - p.start + 1) / 60, 0);
    const highestRate = Math.max(0, ...covered.map((p) => p.perHour));
    return maximum.amount < highestRate * Math.min(hours, longestStayHours);
  };
  /** The lowest binding maximum covering the whole of a window on a day, if any. */
  const capFor = (day: GolemioPeriod["day_in_week"], start: number, end: number) => {
    const caps = maximums
      .filter((m) => m.day === day && m.start <= start && m.end >= end && binds(m))
      .map((m) => m.amount);
    return caps.length > 0 ? Math.min(...caps) : null;
  };

  // One rule per window, price and cap, gathering the days it applies on.
  const rules = new Map<string, TariffRule>();
  for (const charge of band.charges) {
    if (charge.charge_type !== "other" || !charge.charge_interval) continue;
    const pricePerHour =
      Math.round(((Number(charge.charge) * 3600) / charge.charge_interval) * 100) / 100;
    for (const period of everyday(charge)) {
      const rule: TariffRule = {
        days: [],
        start: period.start.slice(0, 5),
        end: period.end.slice(0, 5),
        pricePerHour,
        dailyCapCzk: capFor(period.day_in_week, toMinutes(period.start), toMinutes(period.end)),
      };
      const key = JSON.stringify({ ...rule, days: undefined });
      const existing = rules.get(key) ?? rule;
      existing.days.push(DAY_INDEX[period.day_in_week]);
      rules.set(key, existing);
    }
  }
  return [...rules.values()]
    .map((rule) => ({ ...rule, days: [...new Set(rule.days)].sort((a, b) => a - b) }))
    .sort((a, b) => a.days[0] - b.days[0] || a.start.localeCompare(b.start));
}

const API_ROOT = "https://api.golemio.cz";
const PAGE_SIZE = 2000;

async function getJSON<T>(pathAndQuery: string, apiKey: string): Promise<T> {
  const res = await fetch(`${API_ROOT}${pathAndQuery}`, {
    headers: { "X-Access-Token": apiKey },
  });
  if (!res.ok) throw new Error(`Golemio fetch failed (${res.status}): ${pathAndQuery}`);
  return res.json() as Promise<T>;
}

/** Every TSK zone section and every TSK tariff, reading the sections page by page. */
export async function fetchTskParking(
  apiKey: string,
): Promise<{ parkings: GolemioParking[]; tariffs: GolemioTariff[] }> {
  const parkings: GolemioParking[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getJSON<{ features: { properties: GolemioParking }[] }>(
      `/v3/parking?primarySource=tsk_v2&limit=${PAGE_SIZE}&offset=${offset}`,
      apiKey,
    );
    // A page can come back a record or two short of the page size with more still to
    // come, so only an empty page marks the end.
    if (page.features.length === 0) break;
    parkings.push(...page.features.map((f) => f.properties));
  }
  const tariffs = await getJSON<GolemioTariff[]>(
    "/v3/parking-tariffs?primarySource=tsk_v2&limit=10000",
    apiKey,
  );
  return { parkings, tariffs };
}
