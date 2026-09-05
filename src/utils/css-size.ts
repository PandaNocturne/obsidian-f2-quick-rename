/** Default rename-panel width (CSS length list; commas → min()). */
export const DEFAULT_MODAL_WIDTH = '40vw';

/** Default rename-panel max height (CSS length list; commas → min()). */
export const DEFAULT_MODAL_MAX_HEIGHT = '90vh, 920px';

const CSS_LENGTH =
	/^(?:0|-?\d+(?:\.\d+)?)(?:px|em|rem|vh|vw|vmin|vmax|%|ch|ex|cm|mm|in|pt|pc)$/i;

/** Split a comma-separated CSS length list. */
export function parseCssLengthList(raw: string): string[] {
	return raw
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

export function isValidCssLength(value: string): boolean {
	return CSS_LENGTH.test(value.trim());
}

/**
 * Keep only valid CSS lengths from a user string.
 * Empty / all-invalid → fallback.
 */
export function normalizeCssLengthList(
	raw: string | undefined | null,
	fallback: string,
): string {
	const parts = parseCssLengthList(raw ?? '').filter(isValidCssLength);
	if (parts.length === 0) {
		return fallback;
	}
	return parts.join(', ');
}

/**
 * Build a CSS size value: one length, or `min(a, b, …)` when several are given.
 */
export function toMinCssValue(
	raw: string | undefined | null,
	fallback: string,
): string {
	const normalized = normalizeCssLengthList(raw, fallback);
	const parts = parseCssLengthList(normalized);
	if (parts.length === 0) {
		const fb = parseCssLengthList(fallback);
		return fb.length > 1 ? `min(${fb.join(', ')})` : fallback;
	}
	if (parts.length === 1) return parts[0] ?? fallback;
	return `min(${parts.join(', ')})`;
}
