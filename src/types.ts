export type Advice = "use" | "neutral" | "limit";

export type Which = "now" | "next";

export type HourRow = {
	startsAt: string;
	hour: number;
	repeated: boolean;
	buyGrossPlnPerKwh: number;
	consumption: Advice;
};

export type PriceSettings = {
	operator?: string;
	tariff?: string;
};
