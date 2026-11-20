import streamDeck from "@elgato/streamdeck";

import type { PriceSettings } from "./types";

type GlobalSettings = {
	lastOperator?: string;
	lastTariff?: string;
	token?: string;
};

export type Defaults = {
	load(): Promise<PriceSettings>;
	save(settings: Required<PriceSettings>): Promise<void>;
};

export function isConfigured(settings: PriceSettings): settings is Required<PriceSettings> {
	return Boolean(settings.operator) && Boolean(settings.tariff);
}

// The last tariff picked on any key becomes the default for the next key dropped on the deck.
export const globalDefaults: Defaults = {
	async load() {
		const { lastOperator, lastTariff } = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

		return lastOperator && lastTariff ? { operator: lastOperator, tariff: lastTariff } : {};
	},

	async save({ operator, tariff }) {
		// setGlobalSettings replaces the whole object: keep the API key the settings panel stored.
		const current = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		await streamDeck.settings.setGlobalSettings<GlobalSettings>({ ...current, lastOperator: operator, lastTariff: tariff });
	},
};
