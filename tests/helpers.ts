import type { HourRow } from "../src/types";

export function row(startsAt: string, overrides: Partial<HourRow> = {}): HourRow {
	return {
		startsAt,
		hour: Number(startsAt.slice(11, 13)),
		repeated: false,
		buyGrossPlnPerKwh: 0.5,
		consumption: "neutral",
		...overrides,
	};
}

export function at(iso: string): number {
	return Date.parse(iso);
}
