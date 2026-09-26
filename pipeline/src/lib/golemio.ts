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

export interface GolemioTariff {
  id: string;
  charge_bands: {
    /** The longest a visitor may stay, in seconds, or null when there's no limit. */
    maximum_duration: number | null;
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
