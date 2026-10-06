import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
	sendToPropertyInspector: vi.fn(async (_payload: unknown) => {}),
	openUrl: vi.fn(async (_url: string) => {}),
	warn: vi.fn(),
}));

vi.mock("@elgato/streamdeck", () => ({
	default: {
		ui: { sendToPropertyInspector: sdk.sendToPropertyInspector },
		system: { openUrl: sdk.openUrl },
		logger: { warn: sdk.warn },
	},
	SingletonAction: class {},
}));

import { PriceAction, type PriceActionDeps } from "../src/actions/price-action";
import type { Snapshot } from "../src/outlook-store";
import type { PriceSettings } from "../src/types";

class TestAction extends PriceAction {
	protected override readonly which = "now" as const;
}

function fakeKey(id: string, getSettings: () => Promise<PriceSettings>) {
	return {
		id,
		isKey: () => true,
		setImage: vi.fn(async (_image: string) => {}),
		showAlert: vi.fn(async () => {}),
		setSettings: vi.fn(async (_settings: PriceSettings) => {}),
		getSettings: vi.fn(getSettings),
	};
}

function deps(): PriceActionDeps {
	return {
		store: {
			subscribe: vi.fn((_operator: string, _tariff: string, _listener: (snapshot: Snapshot) => void) => () => {}),
			refresh: vi.fn(async () => {}),
		},
		catalog: {
			operators: vi.fn(async () => [{ label: "Energa", value: "energa" }]),
			tariffs: vi.fn(async (operator: string) => [{ label: `${operator}-G11`, value: "g11" }]),
		},
		defaults: { load: vi.fn(async () => ({})), save: vi.fn(async () => {}) },
	} as unknown as PriceActionDeps;
}

type Handler = (ev: unknown) => Promise<void>;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("PriceAction", () => {
	it("answers the tariff list from the tile it already tracks, without asking Stream Deck for settings", async () => {
		const action = new TestAction(deps());
		const key = fakeKey("A", () => Promise.reject(new Error("The request timed out")));

		await (action.onWillAppear as Handler)({ action: key, payload: { settings: { operator: "energa", tariff: "g11" } } });
		await (action.onSendToPlugin as Handler)({ action: key, payload: { event: "getTariffs" } });

		expect(key.getSettings).not.toHaveBeenCalled();
		expect(sdk.sendToPropertyInspector).toHaveBeenCalledWith({
			event: "getTariffs",
			items: [{ label: "energa-G11", value: "g11" }],
		});
	});

	it("sends an empty tariff list for a key without an operator", async () => {
		const action = new TestAction(deps());
		const key = fakeKey("B", async () => ({}));

		await (action.onWillAppear as Handler)({ action: key, payload: { settings: {} } });
		await (action.onSendToPlugin as Handler)({ action: key, payload: { event: "getTariffs" } });

		expect(sdk.sendToPropertyInspector).toHaveBeenCalledWith({ event: "getTariffs", items: [] });
	});
});
