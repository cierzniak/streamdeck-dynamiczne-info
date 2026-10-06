import type { Api } from "./api";

export type SelectItem = {
	label: string;
	value: string;
};

export class Catalog {
	readonly #api: Pick<Api, "fetchOperators" | "fetchTariffs">;
	readonly #tariffs = new Map<string, Promise<SelectItem[]>>();
	#operators?: Promise<SelectItem[]>;

	constructor(api: Pick<Api, "fetchOperators" | "fetchTariffs">) {
		this.#api = api;
	}

	operators(): Promise<SelectItem[]> {
		this.#operators ??= this.#api
			.fetchOperators()
			.then((operators) => operators.map(({ code, name }) => ({ label: name, value: code })))
			.catch((error: unknown) => {
				this.#operators = undefined;
				throw error;
			});

		return this.#operators;
	}

	tariffs(operator: string): Promise<SelectItem[]> {
		let pending = this.#tariffs.get(operator);
		if (!pending) {
			pending = this.#api
				.fetchTariffs(operator)
				.then((codes) => codes.map((code) => ({ label: code.toUpperCase(), value: code })))
				.catch((error: unknown) => {
					this.#tariffs.delete(operator);
					throw error;
				});
			this.#tariffs.set(operator, pending);
		}

		return pending;
	}
}
