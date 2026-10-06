import { describe, expect, it } from "vitest";

import { formatPrice, PALETTE, renderTile, toDataUrl } from "../src/tile";

function luminance(hex: string): number {
	const channels = [1, 3, 5].map((start) => {
		const value = parseInt(hex.slice(start, start + 2), 16) / 255;

		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

	return (light + 0.05) / (dark + 0.05);
}

describe("formatPrice", () => {
	it.each([
		[0.47, "0,47"],
		[1.31, "1,31"],
		[0.5, "0,50"],
		[12.345, "12,35"],
		[-0.05, "-0,05"],
		[0, "0,00"],
	])("formats %f as %s", (price, expected) => {
		expect(formatPrice(price)).toBe(expected);
	});

	it("does not show a negative zero", () => {
		expect(formatPrice(-0.004)).toBe("0,00");
	});
});

describe("renderTile", () => {
	it("draws the label, price and unit on the advice colour", () => {
		const svg = renderTile({ kind: "price", label: "TERAZ", price: 0.47, advice: "use" });

		expect(svg).toContain('viewBox="0 0 144 144"');
		expect(svg).toContain(`fill="${PALETTE.use.bg}"`);
		expect(svg).toContain(">TERAZ<");
		expect(svg).toContain(">0,47<");
		expect(svg).toContain(">zł/kWh<");
	});

	it.each([
		["use", PALETTE.use.bg],
		["neutral", PALETTE.neutral.bg],
		["limit", PALETTE.limit.bg],
	] as const)("uses the %s background", (advice, bg) => {
		expect(renderTile({ kind: "price", label: "15:00", price: 1, advice })).toContain(`fill="${bg}"`);
	});

	it("shrinks the price when it has more than four characters", () => {
		const short = renderTile({ kind: "price", label: "TERAZ", price: 0.47, advice: "use" });
		const long = renderTile({ kind: "price", label: "TERAZ", price: -0.05, advice: "use" });

		expect(short).toContain('font-size="50"');
		expect(long).toContain('font-size="40"');
	});

	it("asks for configuration on a muted tile", () => {
		const svg = renderTile({ kind: "unconfigured" });

		expect(svg).toContain(`fill="${PALETTE.muted.bg}"`);
		expect(svg).toContain(">Ustaw<");
		expect(svg).toContain(">taryfę<");
	});

	it("shows an ellipsis while loading", () => {
		expect(renderTile({ kind: "loading" })).toContain(">…<");
	});

	it.each(["no-data", "error"] as const)("shows a dash with the hour label for %s", (kind) => {
		const svg = renderTile({ kind, label: "00:00" });

		expect(svg).toContain(`fill="${PALETTE.muted.bg}"`);
		expect(svg).toContain(">00:00<");
		expect(svg).toContain(">—<");
	});

	it("escapes markup in labels", () => {
		expect(renderTile({ kind: "no-data", label: "<b>&" })).toContain(">&lt;b&gt;&amp;<");
	});
});

describe("PALETTE", () => {
	it.each(Object.entries(PALETTE))("%s keeps text readable (4.5:1)", (_name, { bg, fg }) => {
		expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("toDataUrl", () => {
	it("wraps the SVG in a data URL that decodes back", () => {
		const svg = renderTile({ kind: "loading" });
		const url = toDataUrl(svg);
		const prefix = "data:image/svg+xml;charset=utf8,";

		expect(url.startsWith(prefix)).toBe(true);
		expect(decodeURIComponent(url.slice(prefix.length))).toBe(svg);
	});
});
