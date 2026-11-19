import type { Advice, HourRow } from "./types";

export const BASE_URL = "https://dynamiczne.info";

const TIMEOUT_MS = 10_000;
const ADVICE: readonly Advice[] = ["use", "neutral", "limit"];

export type ApiErrorKind = "network" | "server" | "rate-limited" | "unknown-tariff" | "no-fixing";

export class ApiError extends Error {
	constructor(
		readonly kind: ApiErrorKind,
		message: string,
		readonly retryAfterSeconds?: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export type Api = {
	fetchOutlook(operator: string, tariff: string): Promise<HourRow[]>;
	fetchOperators(): Promise<{ code: string; name: string }[]>;
	fetchTariffs(operator: string): Promise<string[]>;
};

export function createApi(
	fetchFn: typeof fetch = fetch,
	userAgent = "streamdeck-dynamiczne-info",
	token: () => string | undefined = () => undefined,
): Api {
	async function getData(path: string): Promise<unknown> {
		const headers: Record<string, string> = { Accept: "application/json", "User-Agent": userAgent };
		const key = token()?.trim();
		if (key) {
			headers.Authorization = `Bearer ${key}`;
		}

		let response: Response;
		try {
			response = await fetchFn(`${BASE_URL}${path}`, {
				headers,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch (cause) {
			throw new ApiError("network", String(cause));
		}

		if (response.status === 429) {
			const retryAfter = Number(response.headers.get("Retry-After"));

			throw new ApiError("rate-limited", "Rate limited", retryAfter > 0 ? retryAfter : undefined);
		}

		const body = await readJson(response);

		if (response.status === 404) {
			const message = errorMessage(body);
			if (message === "") {
				// Not the API talking (a proxy with no route, mid-deploy): an outage, not a wrong tariff.
				throw new ApiError("server", "HTTP 404");
			}

			// The server has no error codes; the missing-fixing message is the only one worth telling apart.
			throw new ApiError(message.startsWith("No fixing") ? "no-fixing" : "unknown-tariff", message);
		}
		if (!response.ok) {
			throw new ApiError("server", `HTTP ${response.status}`);
		}
		if (!isRecord(body) || !("data" in body)) {
			throw new ApiError("server", "Unexpected response body");
		}

		return body.data;
	}

	return {
		async fetchOutlook(operator, tariff) {
			const data = await getData(`/api/v1/outlook/${encodeURIComponent(operator)}/${encodeURIComponent(tariff)}?sell=false`);
			if (!isRecord(data) || !isRecord(data.today)) {
				throw new ApiError("server", "Unexpected outlook shape");
			}

			return [...parseRows(data.today), ...parseRows(data.tomorrow)];
		},

		async fetchOperators() {
			const data = await getData("/api/v1/operators");
			if (!Array.isArray(data)) {
				throw new ApiError("server", "Unexpected operators shape");
			}

			return data.flatMap((item) =>
				isRecord(item) && typeof item.code === "string" && typeof item.name === "string"
					? [{ code: item.code, name: item.name }]
					: [],
			);
		},

		async fetchTariffs(operator) {
			const data = await getData(`/api/v1/operators/${encodeURIComponent(operator)}/tariffs`);
			if (!Array.isArray(data)) {
				throw new ApiError("server", "Unexpected tariffs shape");
			}

			return data.flatMap((item) => (isRecord(item) && typeof item.code === "string" ? [item.code] : []));
		},
	};
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function errorMessage(body: unknown): string {
	return isRecord(body) && isRecord(body.error) && typeof body.error.message === "string" ? body.error.message : "";
}

function parseRows(day: unknown): HourRow[] {
	if (!isRecord(day) || !Array.isArray(day.hours)) {
		return [];
	}

	return day.hours.flatMap((item): HourRow[] => {
		if (
			!isRecord(item) ||
			typeof item.startsAt !== "string" ||
			Number.isNaN(Date.parse(item.startsAt)) ||
			typeof item.buyGrossPlnPerKwh !== "number"
		) {
			return [];
		}

		return [
			{
				startsAt: item.startsAt,
				hour: typeof item.hour === "number" ? item.hour : Number(item.startsAt.slice(11, 13)),
				repeated: item.repeated === true,
				buyGrossPlnPerKwh: item.buyGrossPlnPerKwh,
				consumption: ADVICE.find((advice) => advice === item.consumption) ?? "neutral",
			},
		];
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
