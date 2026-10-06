import streamDeck, {
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { BASE_URL } from "../api";
import type { Catalog, SelectItem } from "../catalog";
import type { OutlookStore, Snapshot } from "../outlook-store";
import { type Defaults, isConfigured } from "../settings";
import { renderTile, type TileState, toDataUrl } from "../tile";
import { resolveTileState } from "../tile-state";
import type { PriceSettings, Which } from "../types";

export type PriceActionDeps = {
	store: OutlookStore;
	catalog: Catalog;
	defaults: Defaults;
};

type PropertyInspectorRequest = {
	event?: string;
};

type Tile = {
	action: KeyAction<PriceSettings>;
	settings: PriceSettings;
	key?: string;
	snapshot?: Snapshot;
	unsubscribe?: () => void;
	lastKind?: TileState["kind"];
};

export abstract class PriceAction extends SingletonAction<PriceSettings> {
	protected abstract readonly which: Which;

	readonly #deps: PriceActionDeps;
	readonly #tiles = new Map<string, Tile>();

	constructor(deps: PriceActionDeps) {
		super();
		this.#deps = deps;
	}

	override async onWillAppear(ev: WillAppearEvent<PriceSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		const tile: Tile = { action: ev.action, settings: ev.payload.settings };
		this.#tiles.set(ev.action.id, tile);

		if (!isConfigured(tile.settings)) {
			const defaults = await this.#deps.defaults.load();
			if (this.#tiles.get(ev.action.id) !== tile) {
				return;
			}
			if (isConfigured(defaults)) {
				tile.settings = defaults;
				await ev.action.setSettings(defaults);
			}
		}

		this.#connect(tile);
		await this.#render(tile);
	}

	override onWillDisappear(ev: WillDisappearEvent<PriceSettings>): void {
		this.#tiles.get(ev.action.id)?.unsubscribe?.();
		this.#tiles.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PriceSettings>): Promise<void> {
		const tile = this.#tiles.get(ev.action.id);
		if (!tile) {
			return;
		}

		const operatorChanged = tile.settings.operator !== ev.payload.settings.operator;
		tile.settings = ev.payload.settings;
		this.#connect(tile);
		await this.#render(tile);

		if (isConfigured(tile.settings)) {
			await this.#deps.defaults.save(tile.settings);
		}
		if (operatorChanged) {
			await this.#sendTariffs(tile.settings.operator);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<PriceSettings>): Promise<void> {
		await streamDeck.system.openUrl(BASE_URL);

		const { settings } = ev.payload;
		if (isConfigured(settings)) {
			await this.#deps.store.refresh(settings.operator, settings.tariff);
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<PropertyInspectorRequest, PriceSettings>): Promise<void> {
		switch (ev.payload.event) {
			case "getOperators":
				await this.#sendItems("getOperators", () => this.#deps.catalog.operators());
				break;
			case "getTariffs":
				await this.#sendTariffs((await ev.action.getSettings()).operator);
				break;
		}
	}

	async renderAll(): Promise<void> {
		await Promise.all([...this.#tiles.values()].map((tile) => this.#render(tile)));
	}

	async refreshAll(): Promise<void> {
		await Promise.all(
			[...this.#tiles.values()].map(({ settings }) =>
				isConfigured(settings) ? this.#deps.store.refresh(settings.operator, settings.tariff) : undefined,
			),
		);
	}

	#connect(tile: Tile): void {
		const { settings } = tile;
		const key = isConfigured(settings) ? `${settings.operator}/${settings.tariff}` : undefined;
		if (key === tile.key) {
			return;
		}

		tile.unsubscribe?.();
		tile.unsubscribe = undefined;
		tile.snapshot = undefined;
		tile.key = key;

		if (isConfigured(settings)) {
			tile.unsubscribe = this.#deps.store.subscribe(settings.operator, settings.tariff, (snapshot) => {
				tile.snapshot = snapshot;
				void this.#render(tile);
			});
		}
	}

	async #render(tile: Tile): Promise<void> {
		const state = resolveTileState(tile.settings, tile.snapshot, Date.now(), this.which);
		const becameError = state.kind === "error" && tile.lastKind !== "error";
		tile.lastKind = state.kind;

		try {
			await tile.action.setImage(toDataUrl(renderTile(state)));
			if (becameError) {
				await tile.action.showAlert();
			}
		} catch (error) {
			streamDeck.logger.warn(`Could not draw the key: ${String(error)}`);
		}
	}

	#sendTariffs(operator: string | undefined): Promise<void> {
		return this.#sendItems("getTariffs", () => (operator ? this.#deps.catalog.tariffs(operator) : Promise.resolve([])));
	}

	async #sendItems(event: string, load: () => Promise<SelectItem[]>): Promise<void> {
		let items: SelectItem[] = [];
		try {
			items = await load();
		} catch (error) {
			streamDeck.logger.warn(`Could not load ${event}: ${String(error)}`);
		}

		await streamDeck.ui.sendToPropertyInspector({ event, items });
	}
}
