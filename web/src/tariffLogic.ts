import type { Tariff, TariffRule } from "./types";

/** @example toMinutes("08:30") -> 510 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Checks whether a rule's time window covers the given moment. Windows can wrap past
 * midnight (e.g. "08:00-05:59"), where `days` names the day the window *starts* on.
 */
function ruleActiveAt(rule: TariffRule, dayOfWeek: number, minutes: number): boolean {
  const start = toMinutes(rule.start);
  const end = toMinutes(rule.end);
  const yesterday = (dayOfWeek + 6) % 7;

  if (start <= end) {
    return rule.days.includes(dayOfWeek) && minutes >= start && minutes <= end;
  }
  return (
    (rule.days.includes(dayOfWeek) && minutes >= start) ||
    (rule.days.includes(yesterday) && minutes <= end)
  );
}

/** Returns the tariff rule in effect at `now`, or null if parking is free at this moment. */
export function activeRuleNow(tariff: Tariff, now: Date): TariffRule | null {
  const dayOfWeek = (now.getDay() + 6) % 7; // JS: 0=Sun -> ours: 0=Mon
  const minutes = now.getHours() * 60 + now.getMinutes();
  return tariff.rules.find((rule) => ruleActiveAt(rule, dayOfWeek, minutes)) ?? null;
}
