import { ApiError, type ApiErrorKind } from "./api";
import type { HourRow } from "./types";

export const POLL_MS = 300_000;
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
	timer?: ReturnType<typeof setTimeout>;
	inFlight?: Promise<void>;
};

export class OutlookStore {
	readonly #entries = new Map<string, Entry>();
	readonly #fetchOutlook: (operator: string, tariff: string) => Promise<HourRow[]>;

	constructor(fetchOutlook: (operator: string, tariff: string) => Promise<HourRow[]>) {
		this.#fetchOutlook = fetchOutlook;
	}

	subscribe(operator: string, tariff: string, listener: Listener): () => void {
		const key = keyOf(operator, tariff);
		const existing = this.#entries.get(key);
		const entry: Entry = existing ?? { operator, tariff, listeners: new Set() };

		entry.listeners.add(listener);
		if (!existing) {
			this.#entries.set(key, entry);
			void this.#load(key, entry);
		} else if (entry.snapshot) {
			listener(entry.snapshot);
		}

		return () => {
			entry.listeners.delete(listener);
			if (entry.listeners.size === 0 && this.#entries.get(key) === entry) {
				clearTimeout(entry.timer);
				this.#entries.delete(key);
			}
		};
	}

	refresh(operator: string, tariff: string): Promise<void> {
		const key = keyOf(operator, tariff);
		const entry = this.#entries.get(key);
		if (!entry) {
			return Promise.resolve();
		}
		if (entry.loadedAt !== undefined && Date.now() - entry.loadedAt < MIN_REFRESH_GAP_MS) {
			return Promise.resolve();
		}

		return this.#load(key, entry);
	}

	#load(key: string, entry: Entry): Promise<void> {
		if (entry.inFlight) {
			return entry.inFlight;
		}

		clearTimeout(entry.timer);
		entry.inFlight = this.#run(key, entry).finally(() => {
			entry.inFlight = undefined;
		});

		return entry.inFlight;
	}

	async #run(key: string, entry: Entry): Promise<void> {
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

		if (this.#entries.get(key) !== entry) {
			return;
		}

		entry.snapshot = snapshot;
		entry.loadedAt = Date.now();
		entry.timer = setTimeout(() => void this.#load(key, entry), delay);
		for (const listener of [...entry.listeners]) {
			listener(snapshot);
		}
	}
}

function keyOf(operator: string, tariff: string): string {
	return `${operator}/${tariff}`;
}
