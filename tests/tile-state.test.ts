import { describe, expect, it } from "vitest";

import type { Snapshot } from "../src/outlook-store";
import { resolveTileState } from "../src/tile-state";
import { at, row } from "./helpers";

const settings = { operator: "energa", tariff: "g11" };
const now = at("2026-10-06T23:30:00+02:00");
const today = [row("2026-10-06T23:00:00+02:00", { buyGrossPlnPerKwh: 0.47, consumption: "use" })];
const tomorrow = row("2026-10-07T00:00:00+02:00", { buyGrossPlnPerKwh: 1.31, consumption: "limit" });

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
	return { rows: today, error: null, ...overrides };
}

describe("resolveTileState", () => {
	it.each([{}, { operator: "energa" }, { tariff: "g11" }, { operator: "", tariff: "g11" }])(
		"asks for configuration when settings are %o",
		(incomplete) => {
			expect(resolveTileState(incomplete, snapshot(), now, "now")).toEqual({ kind: "unconfigured" });
		},
	);

	it("is loading until the first snapshot arrives", () => {
		expect(resolveTileState(settings, undefined, now, "now")).toEqual({ kind: "loading" });
	});

	it("shows the current price under the TERAZ label", () => {
		expect(resolveTileState(settings, snapshot(), now, "now")).toEqual({
			kind: "price",
			label: "TERAZ",
			price: 0.47,
			advice: "use",
		});
	});

	it("shows the next price under its hour", () => {
		expect(resolveTileState(settings, snapshot({ rows: [...today, tomorrow] }), now, "next")).toEqual({
			kind: "price",
			label: "00:00",
			price: 1.31,
			advice: "limit",
		});
	});

	it("keeps showing a cached price after a failed refresh", () => {
		expect(resolveTileState(settings, snapshot({ error: "network" }), now, "now").kind).toBe("price");
	});

	it("reports no data for the next hour before tomorrow is published", () => {
		expect(resolveTileState(settings, snapshot(), now, "next")).toEqual({ kind: "no-data", label: "00:00" });
	});

	it("reports no data when today has no fixing at all", () => {
		expect(resolveTileState(settings, snapshot({ rows: [], error: "no-fixing" }), now, "now")).toEqual({
			kind: "no-data",
			label: "TERAZ",
		});
	});

	it("asks for configuration when the tariff does not exist", () => {
		expect(resolveTileState(settings, snapshot({ rows: [], error: "unknown-tariff" }), now, "now")).toEqual({
			kind: "unconfigured",
		});
	});

	it.each(["network", "server", "rate-limited"] as const)("reports an error when %s leaves the hour uncovered", (error) => {
		expect(resolveTileState(settings, snapshot({ rows: [], error }), now, "now")).toEqual({ kind: "error", label: "TERAZ" });
		expect(resolveTileState(settings, snapshot({ rows: today, error }), now, "next")).toEqual({ kind: "error", label: "00:00" });
	});

	it("reports an error once stale rows no longer cover now", () => {
		const nextMorning = at("2026-10-07T08:15:00+02:00");

		expect(resolveTileState(settings, snapshot({ error: "network" }), nextMorning, "now")).toEqual({
			kind: "error",
			label: "TERAZ",
		});
	});
});
