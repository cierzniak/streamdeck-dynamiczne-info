import { ApiError, type ApiErrorKind } from "./api";
import type { HourRow } from "./types";

export const POLL_MS = 1_800_000;
export const RETRY_MS = 60_000;
export const MAX_RETRY_MS = 3_600_000;
export const MIN_REFRESH_GAP_MS = 10_000;

const TRANSIENT: readonly ApiErrorKind[] = ["network", "server", "rate-limited"];

export type Snapshot = {
	rows: readonly HourRow[];
	error: ApiErrorKind | null;
};

type Listener = (snapshot: Snapshot) => void;

type Entry = {
	operator: string;
	tariff: string;
	listeners: Set<Listener>;
	snapshot?: Snapshot;
	loadedAt?: number;
	nextLoadAt?: number;
	timer?: ReturnType<typeof setTimeout>;
	inFlight?: Promise<void>;
};

/**
 * Entries outlive their subscribers: a key that leaves the screen (page or folder switch) and
 * comes back is served from the cache and keeps the poll schedule it had, instead of costing
 * a request per visit. Only the timer stops while nobody watches.
 */
export class OutlookStore {
	readonly #entries = new Map<string, Entry>();
	readonly #fetchOutlook: (operator: string, tariff: string) => Promise<HourRow[]>;

	constructor(fetchOutlook: (operator: string, tariff: string) => Promise<HourRow[]>) {
		this.#fetchOutlook = fetchOutlook;
	}

	subscribe(operator: string, tariff: string, listener: Listener): () => void {
		const key = `${operator}/${tariff}`;
		const existing = this.#entries.get(key);
		const entry: Entry = existing ?? { operator, tariff, listeners: new Set() };
		const wasIdle = entry.listeners.size === 0;

		entry.listeners.add(listener);
		if (!existing) {
			this.#entries.set(key, entry);
			void this.#load(entry);
		} else {
			if (entry.snapshot) {
				listener(entry.snapshot);
			}
			if (wasIdle && !entry.inFlight) {
				this.#schedule(entry, Math.max(0, (entry.nextLoadAt ?? 0) - Date.now()));
			}
		}

		return () => {
			entry.listeners.delete(listener);
			if (entry.listeners.size === 0) {
				clearTimeout(entry.timer);
				entry.timer = undefined;
			}
		};
	}

	refresh(operator: string, tariff: string): Promise<void> {
		const entry = this.#entries.get(`${operator}/${tariff}`);
		if (!entry || entry.listeners.size === 0) {
			return Promise.resolve();
		}
		if (entry.loadedAt !== undefined && Date.now() - entry.loadedAt < MIN_REFRESH_GAP_MS) {
			return Promise.resolve();
		}

		return this.#load(entry);
	}

	#schedule(entry: Entry, delay: number): void {
		clearTimeout(entry.timer);
		entry.timer = setTimeout(() => void this.#load(entry), delay);
	}

	#load(entry: Entry): Promise<void> {
		if (entry.inFlight) {
			return entry.inFlight;
		}

		clearTimeout(entry.timer);
		entry.timer = undefined;
		entry.inFlight = this.#run(entry).finally(() => {
			entry.inFlight = undefined;
		});

		return entry.inFlight;
	}

	async #run(entry: Entry): Promise<void> {
		let delay = POLL_MS;
		let snapshot: Snapshot;

		try {
			snapshot = { rows: await this.#fetchOutlook(entry.operator, entry.tariff), error: null };
		} catch (caught) {
			const error = caught instanceof ApiError ? caught : new ApiError("network", String(caught));

			snapshot = { rows: entry.snapshot?.rows ?? [], error: error.kind };
			if (TRANSIENT.includes(error.kind)) {
				// Retry-After comes from the network: unbounded, it could park the key for good or
				// overflow setTimeout into firing at once.
				delay = Math.min(MAX_RETRY_MS, Math.max(RETRY_MS, (error.retryAfterSeconds ?? 0) * 1000));
			}
		}

		entry.snapshot = snapshot;
		entry.loadedAt = Date.now();
		entry.nextLoadAt = entry.loadedAt + delay;
		if (entry.listeners.size > 0) {
			this.#schedule(entry, delay);
		}
		for (const listener of [...entry.listeners]) {
			listener(snapshot);
		}
	}
}
