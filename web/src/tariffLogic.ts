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
