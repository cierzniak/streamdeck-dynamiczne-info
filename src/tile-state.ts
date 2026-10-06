import { clockLabel, hourLabel, pickHour, targetHourStart } from "./hours";
import type { Snapshot } from "./outlook-store";
import type { TileState } from "./tile";
import type { PriceSettings, Which } from "./types";

const NOW_LABEL = "TERAZ";

export function resolveTileState(
	settings: PriceSettings,
	snapshot: Snapshot | undefined,
	now: number,
	which: Which,
): TileState {
	if (!settings.operator || !settings.tariff) {
		return { kind: "unconfigured" };
	}
	if (!snapshot) {
		return { kind: "loading" };
	}

	// A day's fixing never changes, so a cached row stays true even if the last refresh failed.
	const row = pickHour(snapshot.rows, now, which);
	if (row) {
		return {
			kind: "price",
			label: which === "now" ? NOW_LABEL : hourLabel(row),
			price: row.buyGrossPlnPerKwh,
			advice: row.consumption,
		};
	}
	if (snapshot.error === "unknown-tariff") {
		return { kind: "unconfigured" };
	}

	const label = which === "now" ? NOW_LABEL : clockLabel(targetHourStart(now, "next"));

	return snapshot.error === null || snapshot.error === "no-fixing" ? { kind: "no-data", label } : { kind: "error", label };
}
