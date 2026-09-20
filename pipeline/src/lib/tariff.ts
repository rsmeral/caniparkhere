import { expandDayRange } from "./days.js";

export interface TariffRule {
  days: number[]; // 0=Mon .. 6=Sun
  start: string; // "HH:MM"
  end: string; // "HH:MM", may be < start meaning it wraps past midnight
  pricePerHour: number;
  dailyCapCzk: number | null;
}

// Mandatory prefix; the "(max. N Kč)" suffix is parsed separately since the
// source ArcGIS field truncates at a fixed length, occasionally cutting the
// suffix short (e.g. "...Kč/hod (ma"). Recover what we can rather than fail the build.
const CLAUSE_RE =
  /^([A-Za-zÁ-Žá-ž]{2}(?:-[A-Za-zÁ-Žá-ž]{2})?) (\d{2}:\d{2})-(\d{2}:\d{2}) (\d+)Kč\/hod\s*(.*)$/;
const CAP_RE = /^\(max\. (\d+) Kč\)$/;

/**
 * Parses TSK's `<br/>`-joined tariftext field into structured rules; returns null for
 * blank text (spots with no visitor tariff).
 * @example parseTariffText("Po-Pá 08:00-17:59 20Kč/hod (max. 90 Kč)")
 *   -> [{ days: [0,1,2,3,4], start: "08:00", end: "17:59", pricePerHour: 20, dailyCapCzk: 90 }]
 */
export function parseTariffText(text: string): TariffRule[] | null {
  if (!text || !text.trim()) return null;
  return text.split("<br/>").map((clause) => {
    const trimmed = clause.trim();
    const m = CLAUSE_RE.exec(trimmed);
    if (!m) throw new Error(`Unrecognized tariftext clause: ${JSON.stringify(clause)}`);
    const [, dayToken, start, end, price, suffix] = m;
    let dailyCapCzk: number | null = null;
    if (suffix) {
      const capMatch = CAP_RE.exec(suffix);
      if (capMatch) {
        dailyCapCzk = Number(capMatch[1]);
      } else {
        console.warn(
          `  tariftext suffix truncated/unrecognized, dropping cap: ${JSON.stringify(trimmed)}`,
        );
      }
    }
    return { days: expandDayRange(dayToken), start, end, pricePerHour: Number(price), dailyCapCzk };
  });
}
