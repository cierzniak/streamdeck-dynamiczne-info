import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/api";
import { MIN_REFRESH_GAP_MS, OutlookStore, POLL_MS, RETRY_MS } from "../src/outlook-store";
import type { HourRow } from "../src/types";
import { row } from "./helpers";

const rows = [row("2026-10-06T14:00:00+02:00")];

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function flush(): Promise<void> {
	return vi.advanceTimersByTimeAsync(0).then(() => undefined);
}

describe("OutlookStore", () => {
	it("serves two subscribers of one tariff from a single request", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);
		const first = vi.fn();
		const second = vi.fn();

		store.subscribe("energa", "g11", first);
		store.subscribe("energa", "g11", second);
		await flush();

		expect(fetchOutlook).toHaveBeenCalledTimes(1);
		expect(fetchOutlook).toHaveBeenCalledWith("energa", "g11");
		expect(first).toHaveBeenCalledWith({ rows, error: null });
		expect(second).toHaveBeenCalledWith({ rows, error: null });
	});

	it("fetches separately for a different tariff", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);

		store.subscribe("energa", "g11", vi.fn());
		store.subscribe("energa", "g12", vi.fn());
		await flush();

		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("hands the cached snapshot to a late subscriber without a new request", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);
		store.subscribe("energa", "g11", vi.fn());
		await flush();
		const late = vi.fn();

		store.subscribe("energa", "g11", late);

		expect(late).toHaveBeenCalledWith({ rows, error: null });
		expect(fetchOutlook).toHaveBeenCalledTimes(1);
	});

	it("polls every five minutes", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);
		store.subscribe("energa", "g11", vi.fn());
		await flush();

		await vi.advanceTimersByTimeAsync(POLL_MS - 1);
		expect(fetchOutlook).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("stops polling after the last subscriber leaves", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);
		const leaveFirst = store.subscribe("energa", "g11", vi.fn());
		const leaveSecond = store.subscribe("energa", "g11", vi.fn());
		await flush();

		leaveFirst();
		await vi.advanceTimersByTimeAsync(POLL_MS);
		expect(fetchOutlook).toHaveBeenCalledTimes(2);

		leaveSecond();
		await vi.advanceTimersByTimeAsync(POLL_MS * 3);
		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("keeps the last rows when a later request fails and retries after a minute", async () => {
		const fetchOutlook = vi
			.fn<(operator: string, tariff: string) => Promise<HourRow[]>>()
			.mockResolvedValueOnce(rows)
			.mockRejectedValueOnce(new ApiError("network", "offline"))
			.mockResolvedValue(rows);
		const store = new OutlookStore(fetchOutlook);
		const listener = vi.fn();
		store.subscribe("energa", "g11", listener);
		await flush();

		await vi.advanceTimersByTimeAsync(POLL_MS);
		expect(listener).toHaveBeenLastCalledWith({ rows, error: "network" });

		await vi.advanceTimersByTimeAsync(RETRY_MS);
		expect(fetchOutlook).toHaveBeenCalledTimes(3);
		expect(listener).toHaveBeenLastCalledWith({ rows, error: null });
	});

	it("reports an error with no rows when the first request fails", async () => {
		const store = new OutlookStore(vi.fn(async () => Promise.reject(new ApiError("server", "HTTP 503"))));
		const listener = vi.fn();

		store.subscribe("energa", "g11", listener);
		await flush();

		expect(listener).toHaveBeenCalledWith({ rows: [], error: "server" });
	});

	it("treats a non-API failure as a network error", async () => {
		const store = new OutlookStore(vi.fn(async () => Promise.reject(new Error("boom"))));
		const listener = vi.fn();

		store.subscribe("energa", "g11", listener);
		await flush();

		expect(listener).toHaveBeenCalledWith({ rows: [], error: "network" });
	});

	it("waits as long as Retry-After asks", async () => {
		const fetchOutlook = vi
			.fn<(operator: string, tariff: string) => Promise<HourRow[]>>()
			.mockRejectedValueOnce(new ApiError("rate-limited", "slow down", 120))
			.mockResolvedValue(rows);
		const store = new OutlookStore(fetchOutlook);
		store.subscribe("energa", "g11", vi.fn());
		await flush();

		await vi.advanceTimersByTimeAsync(RETRY_MS);
		expect(fetchOutlook).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("does not hammer the API for a tariff that does not exist", async () => {
		const fetchOutlook = vi.fn(async () => Promise.reject(new ApiError("unknown-tariff", "No tariff")));
		const store = new OutlookStore(fetchOutlook);
		store.subscribe("energa", "g99", vi.fn());
		await flush();

		await vi.advanceTimersByTimeAsync(POLL_MS - 1);
		expect(fetchOutlook).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("ignores a burst of refreshes right after a load", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);
		store.subscribe("energa", "g11", vi.fn());
		await flush();

		await Promise.all([1, 2, 3, 4, 5].map(() => store.refresh("energa", "g11")));
		expect(fetchOutlook).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(MIN_REFRESH_GAP_MS);
		await store.refresh("energa", "g11");
		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("restarts the poll interval after a manual refresh", async () => {
		const fetchOutlook = vi.fn(async () => rows);
		const store = new OutlookStore(fetchOutlook);
		store.subscribe("energa", "g11", vi.fn());
		await flush();
		await vi.advanceTimersByTimeAsync(POLL_MS - 1000);

		await store.refresh("energa", "g11");
		expect(fetchOutlook).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchOutlook).toHaveBeenCalledTimes(2);
	});

	it("resolves a refresh for a tariff nobody watches", async () => {
		const fetchOutlook = vi.fn(async () => rows);

		await new OutlookStore(fetchOutlook).refresh("energa", "g11");

		expect(fetchOutlook).not.toHaveBeenCalled();
	});

	it("does not notify a subscriber that left while the request was in flight", async () => {
		let resolve: (value: HourRow[]) => void = () => {};
		const fetchOutlook = vi.fn(() => new Promise<HourRow[]>((done) => (resolve = done)));
		const store = new OutlookStore(fetchOutlook);
		const listener = vi.fn();
		const leave = store.subscribe("energa", "g11", listener);

		leave();
		resolve(rows);
		await flush();
		await vi.advanceTimersByTimeAsync(POLL_MS);

		expect(listener).not.toHaveBeenCalled();
		expect(fetchOutlook).toHaveBeenCalledTimes(1);
	});
});
