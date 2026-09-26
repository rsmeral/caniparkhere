import { expandDayRange } from "./days.js";

export interface TariffRule {
  days: number[]; // 0=Mon .. 6=Sun
  start: string; // "HH:MM"
  end: string; // "HH:MM", within the same day
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
 *
 * A window that runs past midnight, like "Po-Pá 08:00-05:59", means both of its parts on
 * each of its days: Monday to Friday 00:00-05:59 and 08:00-23:59. That's how Praha 6
 * words its hours ("Po – Pá 00:00 – 06:00, 08:00 – 24:00", weekends free) and how TSK's
 * own tariffs in Golemio encode them, so a Friday night into Saturday is free.
 * @example parseTariffText("Po-Pá 08:00-17:59 20Kč/hod (max. 90 Kč)")
 *   -> [{ days: [0,1,2,3,4], start: "08:00", end: "17:59", pricePerHour: 20, dailyCapCzk: 90 }]
 */
export function parseTariffText(text: string): TariffRule[] | null {
  if (!text || !text.trim()) return null;
  return text.split("<br/>").flatMap((clause): TariffRule[] => {
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
    const rule = { days: expandDayRange(dayToken), pricePerHour: Number(price), dailyCapCzk };
    if (end >= start) return [{ ...rule, start, end }];
    return [
      { ...rule, start: "00:00", end },
      { ...rule, start, end: "23:59" },
    ];
  });
}
