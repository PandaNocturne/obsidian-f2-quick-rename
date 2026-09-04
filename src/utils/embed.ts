import { normalizePath, TFile } from 'obsidian';

export interface EmbedMatch {
	/** Link path / wiki target (without alias) */
	linkpath: string;
	/** Display alias / alt text, if any */
	alias: string | null;
	/** Raw matched text */
	raw: string;
}

/**
 * Parse wiki embeds/links and markdown images from selection/line text.
 * Supports:
 * - `[[note]]` / `[[note|alias]]`
 * - `![[image.png]]` / `![[image.png|alias]]`
 * - `![alias](path.png)` / `![](path.png)`
 * - `[text](path.md)`
 */
export function matchSelectionEmbed(text: string): EmbedMatch | null {
	const trimmed = text.trim();
	if (!trimmed) return null;

	// Wiki-style: optional !, then [[target|alias]] or [[target]]
	const wiki = trimmed.match(
		/^!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/,
	);
	if (wiki) {
		const linkpath = decodeURIComponent(wiki[1]?.trim() ?? '');
		const alias = wiki[2] !== undefined ? wiki[2] : null;
		if (linkpath) {
			return { linkpath, alias, raw: wiki[0] };
		}
	}

	// Markdown image / link: ![alias](path) or [text](path)
	const md = trimmed.match(/^!?\[([^\]]*)\]\(([^)\n]+)\)/);
	if (md) {
		const alias = md[1] ?? '';
		let linkpath = (md[2] ?? '').trim();
		// Strip optional title: path "title"
		const titleSep = linkpath.match(/^([^\s]+)(?:\s+".*")?$/);
		if (titleSep?.[1]) linkpath = titleSep[1];
		try {
			linkpath = decodeURIComponent(linkpath);
		} catch {
			// keep raw
		}
		if (linkpath) {
			return {
				linkpath,
				alias: alias.length > 0 ? alias : null,
				raw: md[0],
			};
		}
	}

	// Fallback: looser scan anywhere in the line (original script behavior)
	const looseWiki = trimmed.match(
		/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/,
	);
	if (looseWiki) {
		const linkpath = decodeURIComponent(looseWiki[1]?.trim() ?? '');
		const alias = looseWiki[2] !== undefined ? looseWiki[2] : null;
		if (linkpath) {
			return { linkpath, alias, raw: looseWiki[0] };
		}
	}

	const looseMd = trimmed.match(/!?\[([^\]]*)\]\(([^)\n]+)\)/);
	if (looseMd) {
		const alias = looseMd[1] ?? '';
		let linkpath = (looseMd[2] ?? '').trim();
		const titleSep = linkpath.match(/^([^\s]+)(?:\s+".*")?$/);
		if (titleSep?.[1]) linkpath = titleSep[1];
		try {
			linkpath = decodeURIComponent(linkpath);
		} catch {
			// keep raw
		}
		if (linkpath) {
			return {
				linkpath,
				alias: alias.length > 0 ? alias : null,
				raw: looseMd[0],
			};
		}
	}

	return null;
}

/**
 * Resolve a linkpath relative to the active file.
 */
export function resolveEmbedFile(
	app: {
		metadataCache: {
			getFirstLinkpathDest: (
				linkpath: string,
				sourcePath: string,
			) => TFile | null;
		};
		vault: { getAbstractFileByPath: (path: string) => unknown };
	},
	linkpath: string,
	sourcePath: string,
): TFile | null {
	const cleaned = linkpath.replace(/^\.\//, '').split('#')[0]?.split('|')[0];
	if (!cleaned) return null;

	const dest = app.metadataCache.getFirstLinkpathDest(cleaned, sourcePath);
	if (dest) return dest;

	// Absolute / vault-relative path fallback
	const normalized = normalizePath(cleaned);
	const abs = app.vault.getAbstractFileByPath(normalized);
	if (abs instanceof TFile) return abs;

	return null;
}

export function stripExcalidrawBasename(basename: string): string {
	return basename.endsWith('.excalidraw')
		? basename.slice(0, -'.excalidraw'.length)
		: basename;
}

export function isExcalidrawFile(file: TFile): boolean {
	return (
		file.extension === 'excalidraw' ||
		file.name.endsWith('.excalidraw.md')
	);
}

export function normalizeSpaces(name: string): string {
	return name.replace(/\s+/g, ' ').trim();
}
