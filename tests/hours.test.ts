import { describe, expect, it } from "vitest";

import { clockLabel, hourLabel, msUntilNextHour, pickHour, targetHourStart } from "../src/hours";
import { at, row } from "./helpers";

const evening = [
	row("2026-10-06T14:00:00+02:00", { buyGrossPlnPerKwh: 0.47 }),
	row("2026-10-06T15:00:00+02:00", { buyGrossPlnPerKwh: 1.31 }),
	row("2026-10-06T23:00:00+02:00", { buyGrossPlnPerKwh: 0.6 }),
];
const withTomorrow = [...evening, row("2026-10-07T00:00:00+02:00", { buyGrossPlnPerKwh: 0.2 })];

describe("pickHour", () => {
	it("picks the hour covering now", () => {
		expect(pickHour(evening, at("2026-10-06T14:37:12+02:00"), "now")?.buyGrossPlnPerKwh).toBe(0.47);
	});

	it("picks the following hour for next", () => {
		expect(pickHour(evening, at("2026-10-06T14:37:12+02:00"), "next")?.buyGrossPlnPerKwh).toBe(1.31);
	});

	it("treats the exact hour boundary as the new hour", () => {
		expect(pickHour(evening, at("2026-10-06T15:00:00+02:00"), "now")?.buyGrossPlnPerKwh).toBe(1.31);
	});

	it("crosses midnight into tomorrow", () => {
		expect(pickHour(withTomorrow, at("2026-10-06T23:30:00+02:00"), "next")?.buyGrossPlnPerKwh).toBe(0.2);
	});

	it("returns undefined when tomorrow is not published yet", () => {
		expect(pickHour(evening, at("2026-10-06T23:30:00+02:00"), "next")).toBeUndefined();
	});

	it("returns undefined when now is outside the data", () => {
		expect(pickHour(evening, at("2026-10-08T10:00:00+02:00"), "now")).toBeUndefined();
	});

	it("does not skip to a later hour when the next one is missing", () => {
		const gap = [row("2026-10-06T14:00:00+02:00"), row("2026-10-06T16:00:00+02:00")];
		expect(pickHour(gap, at("2026-10-06T14:10:00+02:00"), "next")).toBeUndefined();
	});

	it("handles the 25-hour day: the repeated 02:00 follows the first 02:00", () => {
		const fallBack = [
			row("2026-10-25T01:00:00+02:00"),
			row("2026-10-25T02:00:00+02:00", { buyGrossPlnPerKwh: 0.3 }),
			row("2026-10-25T02:00:00+01:00", { buyGrossPlnPerKwh: 0.4, repeated: true }),
			row("2026-10-25T03:00:00+01:00"),
		];
		const duringFirst = at("2026-10-25T02:30:00+02:00");

		expect(pickHour(fallBack, duringFirst, "now")?.buyGrossPlnPerKwh).toBe(0.3);
		expect(pickHour(fallBack, duringFirst, "next")?.repeated).toBe(true);
		expect(pickHour(fallBack, at("2026-10-25T02:30:00+01:00"), "now")?.buyGrossPlnPerKwh).toBe(0.4);
	});

	it("handles the 23-hour day: 03:00 follows 01:00", () => {
		const springForward = [
			row("2026-03-29T01:00:00+01:00"),
			row("2026-03-29T03:00:00+02:00", { buyGrossPlnPerKwh: 0.9 }),
		];

		expect(pickHour(springForward, at("2026-03-29T01:30:00+01:00"), "next")?.buyGrossPlnPerKwh).toBe(0.9);
	});
});

describe("targetHourStart", () => {
	it("floors now to the hour and adds one hour for next", () => {
		const now = at("2026-10-06T14:37:12+02:00");

		expect(targetHourStart(now, "now")).toBe(at("2026-10-06T14:00:00+02:00"));
		expect(targetHourStart(now, "next")).toBe(at("2026-10-06T15:00:00+02:00"));
	});
});

describe("msUntilNextHour", () => {
	it("counts down to the next full hour", () => {
		expect(msUntilNextHour(at("2026-10-06T14:59:30+02:00"))).toBe(30_000);
	});

	it("returns a full hour on the boundary instead of zero", () => {
		expect(msUntilNextHour(at("2026-10-06T15:00:00+02:00"))).toBe(3_600_000);
	});
});

describe("labels", () => {
	it("takes the wall-clock hour from startsAt, not from the machine timezone", () => {
		expect(hourLabel(row("2026-10-06T15:00:00+02:00"))).toBe("15:00");
	});

	it("marks the repeated hour like the website does", () => {
		expect(hourLabel(row("2026-10-25T02:00:00+01:00", { repeated: true }))).toBe("02:00a");
	});

	it("formats a timestamp in Warsaw time", () => {
		expect(clockLabel(Date.UTC(2026, 9, 6, 22, 0))).toBe("00:00");
		expect(clockLabel(Date.UTC(2026, 0, 6, 14, 0))).toBe("15:00");
	});
});
