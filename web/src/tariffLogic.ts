import type { Tariff, TariffRule } from "./types";

/** @example toMinutes("08:30") -> 510 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Checks whether a rule's window covers the given moment. */
function ruleActiveAt(rule: TariffRule, dayOfWeek: number, minutes: number): boolean {
  return (
    rule.days.includes(dayOfWeek) &&
    minutes >= toMinutes(rule.start) &&
    minutes <= toMinutes(rule.end)
  );
}

/** Returns the tariff rule in effect at `now`, or null if parking is free at this moment. */
export function activeRuleNow(tariff: Tariff, now: Date): TariffRule | null {
  const dayOfWeek = (now.getDay() + 6) % 7; // JS: 0=Sun -> ours: 0=Mon
  const minutes = now.getHours() * 60 + now.getMinutes();
  return tariff.rules.find((rule) => ruleActiveAt(rule, dayOfWeek, minutes)) ?? null;
}

/** When parking next switches between paid and free, as seen from the moment asked about. */
export interface Change {
  /** Local time of day, "HH:MM". */
  time: string;
  /** 0 for later today, 1 for tomorrow, and so on. */
  daysAhead: number;
  /** 0=Mon .. 6=Sun */
  weekday: number;
  minutesUntil: number;
}

/**
 * The next moment parking switches from paid to free or back, within a week of `now`, or
 * null if it doesn't. Back-to-back windows - 08:00-23:59 then 00:00-05:59 the next day -
 * count as one paid stretch, so the change is where payment really stops.
 */
export function nextChange(tariff: Tariff, now: Date): Change | null {
  const paidNow = activeRuleNow(tariff, now) !== null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates: Date[] = [];
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() + daysAhead);
    const weekday = (day.getDay() + 6) % 7;
    for (const rule of tariff.rules.filter((r) => r.days.includes(weekday))) {
      for (const minutes of [toMinutes(rule.start), toMinutes(rule.end) + 1]) {
        const at = new Date(day);
        at.setMinutes(minutes);
        if (at > now) candidates.push(at);
      }
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const change = candidates.find((at) => (activeRuleNow(tariff, at) !== null) !== paidNow);
  if (!change) return null;
  const changeDay = new Date(change.getFullYear(), change.getMonth(), change.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${pad(change.getHours())}:${pad(change.getMinutes())}`,
    daysAhead: Math.round((changeDay.getTime() - startOfToday.getTime()) / 86_400_000),
    weekday: (change.getDay() + 6) % 7,
    minutesUntil: Math.ceil((change.getTime() - now.getTime()) / 60_000),
  };
}
