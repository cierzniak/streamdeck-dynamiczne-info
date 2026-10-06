import { action } from "@elgato/streamdeck";

import { PriceAction } from "./price-action";

@action({ UUID: "info.dynamiczne.prices.now" })
export class NowAction extends PriceAction {
	protected override readonly which = "now" as const;
}
