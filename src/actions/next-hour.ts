import { action } from "@elgato/streamdeck";

import { PriceAction } from "./price-action";

@action({ UUID: "info.dynamiczne.prices.next-hour" })
export class NextHourAction extends PriceAction {
	protected override readonly which = "next" as const;
}
