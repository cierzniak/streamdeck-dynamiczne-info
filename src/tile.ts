import type { Advice } from "./types";

export type TileState =
	| { kind: "price"; label: string; price: number; advice: Advice }
	| { kind: "unconfigured" }
	| { kind: "loading" }
	| { kind: "no-data"; label: string }
	| { kind: "error"; label: string };

type Colors = { bg: string; fg: string };

// Backgrounds mirror the website tokens (--price-cheap-fill, --price-high-fill, --bg-surface).
export const PALETTE: Record<Advice | "muted", Colors> = {
	use: { bg: "#2fae6c", fg: "#0e1217" },
	limit: { bg: "#e08a1e", fg: "#0e1217" },
	neutral: { bg: "#161b22", fg: "#f6f8fa" },
	muted: { bg: "#3a424d", fg: "#f6f8fa" },
};

const UNIT = "zł/kWh";

export function formatPrice(price: number): string {
	const text = price.toFixed(2).replace(".", ",");

	return text === "-0,00" ? "0,00" : text;
}

export function renderTile(state: TileState): string {
	switch (state.kind) {
		case "price": {
			const colors = PALETTE[state.advice];
			const value = formatPrice(state.price);

			return frame(colors, [
				line(40, 24, 600, colors.fg, state.label),
				line(94, value.length <= 4 ? 50 : 40, 700, colors.fg, value),
				line(126, 20, 500, colors.fg, UNIT),
			]);
		}
		case "unconfigured":
			return frame(PALETTE.muted, [
				line(66, 26, 600, PALETTE.muted.fg, "Ustaw"),
				line(100, 26, 600, PALETTE.muted.fg, "taryfę"),
			]);
		case "loading":
			return frame(PALETTE.muted, [line(88, 50, 700, PALETTE.muted.fg, "…")]);
		case "no-data":
		case "error":
			return frame(PALETTE.muted, [
				line(40, 24, 600, PALETTE.muted.fg, state.label),
				line(94, 50, 700, PALETTE.muted.fg, "—"),
				line(126, 20, 500, PALETTE.muted.fg, UNIT),
			]);
	}
}

export function toDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function frame(colors: Colors, lines: string[]): string {
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
		`<rect width="144" height="144" fill="${colors.bg}"/>`,
		...lines,
		"</svg>",
	].join("");
}

function line(y: number, size: number, weight: number, fill: string, content: string): string {
	return (
		`<text x="72" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" ` +
		`font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(content)}</text>`
	);
}

function escapeXml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
