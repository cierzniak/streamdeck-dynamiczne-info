import { describe, expect, it, vi } from "vitest";

import { ApiError, createApi } from "../src/api";

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
	const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
		return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
	});

	return { fn, fetchFn: fn as unknown as typeof fetch };
}

function hour(startsAt: string, extra: Record<string, unknown> = {}) {
	return { hour: 14, repeated: false, startsAt, buyGrossPlnPerKwh: 0.47, consumption: "use", ...extra };
}

const outlook = {
	data: {
		operator: "energa",
		tariff: "g11",
		today: { deliveryDate: "2026-10-06", hours: [hour("2026-10-06T14:00:00+02:00")] },
		tomorrow: {
			deliveryDate: "2026-10-07",
			hours: [hour("2026-10-07T00:00:00+02:00", { hour: 0, buyGrossPlnPerKwh: 0.2, consumption: "limit" })],
		},
	},
	meta: { generatedAt: "2026-10-06T14:10:00+02:00" },
};

describe("fetchOutlook", () => {
	it("requests the outlook without sell data and identifies itself", async () => {
		const { fn, fetchFn } = fakeFetch(200, outlook);

		await createApi(fetchFn, "streamdeck-dynamiczne-info/0.1.0.0").fetchOutlook("energa", "g11");

		const [url, init] = fn.mock.calls[0];
		expect(url).toBe("https://dynamiczne.info/api/v1/outlook/energa/g11?sell=false");
		expect(new Headers(init?.headers).get("User-Agent")).toBe("streamdeck-dynamiczne-info/0.1.0.0");
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it("sends the API key as a bearer token only when one is set", async () => {
		const { fn, fetchFn } = fakeFetch(200, outlook);

		await createApi(fetchFn, "ua", () => " dyn_abc ").fetchOutlook("energa", "g11");
		await createApi(fetchFn, "ua", () => "").fetchOutlook("energa", "g11");

		expect(new Headers(fn.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer dyn_abc");
		expect(new Headers(fn.mock.calls[1][1]?.headers).has("Authorization")).toBe(false);
	});

	it("joins today and tomorrow into one list of rows", async () => {
		const rows = await createApi(fakeFetch(200, outlook).fetchFn).fetchOutlook("energa", "g11");

		expect(rows).toEqual([
			{ startsAt: "2026-10-06T14:00:00+02:00", hour: 14, repeated: false, buyGrossPlnPerKwh: 0.47, consumption: "use" },
			{ startsAt: "2026-10-07T00:00:00+02:00", hour: 0, repeated: false, buyGrossPlnPerKwh: 0.2, consumption: "limit" },
		]);
	});

	it("accepts a missing tomorrow", async () => {
		const body = { data: { ...outlook.data, tomorrow: null }, meta: {} };

		expect(await createApi(fakeFetch(200, body).fetchFn).fetchOutlook("energa", "g11")).toHaveLength(1);
	});

	it("drops rows it cannot use and defaults unknown advice to neutral", async () => {
		const body = {
			data: {
				today: {
					hours: [
						hour("2026-10-06T14:00:00+02:00", { consumption: "panic" }),
						hour("2026-10-06T15:00:00+02:00", { buyGrossPlnPerKwh: null }),
						hour("not-a-date"),
						"garbage",
					],
				},
				tomorrow: null,
			},
		};

		const rows = await createApi(fakeFetch(200, body).fetchFn).fetchOutlook("energa", "g11");

		expect(rows).toHaveLength(1);
		expect(rows[0].consumption).toBe("neutral");
	});

	it("escapes path segments", async () => {
		const { fn, fetchFn } = fakeFetch(200, outlook);

		await createApi(fetchFn).fetchOutlook("a/b", "g 11");

		expect(fn.mock.calls[0][0]).toBe("https://dynamiczne.info/api/v1/outlook/a%2Fb/g%2011?sell=false");
	});

	it("reports a missing fixing separately from an unknown tariff", async () => {
		const noFixing = createApi(fakeFetch(404, { error: { message: "No fixing available" } }).fetchFn);
		const noTariff = createApi(fakeFetch(404, { error: { message: "No tariff 'g99' for operator 'energa'" } }).fetchFn);
		const noOperator = createApi(fakeFetch(404, { error: { message: "Unknown operator: foo" } }).fetchFn);

		await expect(noFixing.fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "no-fixing" });
		await expect(noTariff.fetchOutlook("energa", "g99")).rejects.toMatchObject({ kind: "unknown-tariff" });
		await expect(noOperator.fetchOutlook("foo", "g11")).rejects.toMatchObject({ kind: "unknown-tariff" });
	});

	it("carries Retry-After on a rate limit", async () => {
		const api = createApi(fakeFetch(429, { error: { message: "Too many" } }, { "Retry-After": "30" }).fetchFn);

		await expect(api.fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "rate-limited", retryAfterSeconds: 30 });
	});

	it("ignores an unusable Retry-After", async () => {
		const api = createApi(fakeFetch(429, "", { "Retry-After": "soon" }).fetchFn);
		const error = await api.fetchOutlook("energa", "g11").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).retryAfterSeconds).toBeUndefined();
	});

	it("treats a maintenance page as a server error, whatever the status", async () => {
		const html = "<!doctype html><title>Przerwa techniczna</title>";

		await expect(createApi(fakeFetch(503, html).fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "server" });
		await expect(createApi(fakeFetch(200, html).fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "server" });
	});

	it("treats a 404 without the API error body as a server error, not a wrong tariff", async () => {
		const html = "<!doctype html><title>404 Not Found</title>";

		await expect(createApi(fakeFetch(404, html).fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "server" });
		await expect(createApi(fakeFetch(404, { detail: "nope" }).fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "server" });
	});

	it("treats a JSON body of the wrong shape as a server error", async () => {
		await expect(createApi(fakeFetch(200, { data: [] }).fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "server" });
		await expect(createApi(fakeFetch(200, null).fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "server" });
	});

	it("reports a failed request as a network error", async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;

		await expect(createApi(fetchFn).fetchOutlook("energa", "g11")).rejects.toMatchObject({ kind: "network" });
	});
});

describe("catalog endpoints", () => {
	it("lists operators", async () => {
		const { fn, fetchFn } = fakeFetch(200, { data: [{ code: "energa", name: "Energa-Operator" }], meta: {} });

		expect(await createApi(fetchFn).fetchOperators()).toEqual([{ code: "energa", name: "Energa-Operator" }]);
		expect(fn.mock.calls[0][0]).toBe("https://dynamiczne.info/api/v1/operators");
	});

	it("lists tariff codes for an operator", async () => {
		const { fn, fetchFn } = fakeFetch(200, { data: [{ code: "g11" }, { code: "g12" }], meta: { operator: "energa" } });

		expect(await createApi(fetchFn).fetchTariffs("energa")).toEqual(["g11", "g12"]);
		expect(fn.mock.calls[0][0]).toBe("https://dynamiczne.info/api/v1/operators/energa/tariffs");
	});

	it("rejects a catalog payload that is not a list", async () => {
		await expect(createApi(fakeFetch(200, { data: {} }).fetchFn).fetchOperators()).rejects.toMatchObject({ kind: "server" });
	});
});
