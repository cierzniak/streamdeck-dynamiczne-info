import { expect, it } from "vitest";

import { at, row } from "./helpers";

it("builds a row whose hour matches the wall clock in startsAt", () => {
	expect(row("2026-10-06T15:00:00+02:00").hour).toBe(15);
	expect(at("2026-10-06T15:00:00+02:00")).toBe(Date.UTC(2026, 9, 6, 13));
});
