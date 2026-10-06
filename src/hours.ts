import type { HourRow, Which } from "./types";

const HOUR_MS = 3_600_000;

const warsawClock = new Intl.DateTimeFormat("pl-PL", {
	timeZone: "Europe/Warsaw",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/**
 * Delivery hours start on full UTC hours (Warsaw is a whole-hour offset), so flooring the
 * timestamp finds the hour without knowing the machine's timezone or the day's length.
 */
export function targetHourStart(now: number, which: Which): number {
	const current = Math.floor(now / HOUR_MS) * HOUR_MS;

	return which === "now" ? current : current + HOUR_MS;
}

export function pickHour(rows: readonly HourRow[], now: number, which: Which): HourRow | undefined {
	const target = targetHourStart(now, which);

	return rows.find((row) => Date.parse(row.startsAt) === target);
}

export function msUntilNextHour(now: number): number {
	return targetHourStart(now, "next") - now;
}

export function hourLabel(row: HourRow): string {
	return `${row.startsAt.slice(11, 16)}${row.repeated ? "a" : ""}`;
}

export function clockLabel(timestamp: number): string {
	return warsawClock.format(new Date(timestamp));
}
