import { describe, expect, it, vi } from "vitest";

import { Catalog } from "../src/catalog";

function api() {
	return {
		fetchOperators: vi.fn(async () => [{ code: "energa", name: "Energa-Operator" }]),
		fetchTariffs: vi.fn(async (_operator: string) => ["g11", "g12w"]),
	};
}

describe("Catalog", () => {
	it("maps operators to select items", async () => {
		expect(await new Catalog(api()).operators()).toEqual([{ label: "Energa-Operator", value: "energa" }]);
	});

	it("shows tariff codes in upper case and keeps the value as the API expects it", async () => {
		expect(await new Catalog(api()).tariffs("energa")).toEqual([
			{ label: "G11", value: "g11" },
			{ label: "G12W", value: "g12w" },
		]);
	});

	it("asks the API once per list", async () => {
		const source = api();
		const catalog = new Catalog(source);

		await catalog.operators();
		await catalog.operators();
		await catalog.tariffs("energa");
		await catalog.tariffs("energa");
		await catalog.tariffs("tauron");

		expect(source.fetchOperators).toHaveBeenCalledTimes(1);
		expect(source.fetchTariffs).toHaveBeenCalledTimes(2);
	});

	it("does not remember a failure", async () => {
		const source = api();
		source.fetchOperators.mockRejectedValueOnce(new Error("offline"));
		const catalog = new Catalog(source);

		await expect(catalog.operators()).rejects.toThrow("offline");
		expect(await catalog.operators()).toHaveLength(1);
	});
});
