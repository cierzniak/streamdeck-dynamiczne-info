import streamDeck from "@elgato/streamdeck";

import { NextHourAction } from "./actions/next-hour";
import { NowAction } from "./actions/now";
import { createApi } from "./api";
import { Catalog } from "./catalog";
import { msUntilNextHour } from "./hours";
import { OutlookStore } from "./outlook-store";
import { globalDefaults } from "./settings";

// Requests before the global settings arrive go without the key: the anonymous limit still covers them.
let token: string | undefined;
const api = createApi(fetch, `streamdeck-dynamiczne-info/${streamDeck.info.plugin.version}`, () => token);
const deps = {
	store: new OutlookStore(api.fetchOutlook),
	catalog: new Catalog(api),
	defaults: globalDefaults,
};
const actions = [new NowAction(deps), new NextHourAction(deps)];

function renderAll(): void {
	for (const action of actions) {
		void action.renderAll();
	}
}

// The fixing does not change at the top of the hour, the hour a key points at does:
// redraw from the cache instead of waiting for the next poll.
function scheduleHourTick(): void {
	setTimeout(
		() => {
			renderAll();
			scheduleHourTick();
		},
		msUntilNextHour(Date.now()) + 500,
	);
}

// Timers do not run while the machine sleeps, so a wake-up can land in a later hour.
streamDeck.system.onSystemDidWakeUp(() => {
	renderAll();
	for (const action of actions) {
		void action.refreshAll();
	}
});

for (const action of actions) {
	streamDeck.actions.registerAction(action);
}

streamDeck.settings.onDidReceiveGlobalSettings<{ token?: string }>((ev) => {
	token = ev.settings.token;
});

scheduleHourTick();
streamDeck
	.connect()
	.then(async () => {
		token = (await streamDeck.settings.getGlobalSettings<{ token?: string }>()).token;
	})
	.catch((error: unknown) => streamDeck.logger.warn(`Could not read the API key: ${String(error)}`));
