import { normalizePath, TFile } from 'obsidian';

export type EmbedKind = 'wiki' | 'markdown';

export interface EmbedMatch {
	kind: EmbedKind;
	/** Leading `!` for embeds, otherwise empty. */
	embedPrefix: '!' | '';
	/** Decoded path used for vault lookup. */
	linkpath: string;
	/** Path text as written in the source (for rebuild). */
	linkpathRaw: string;
	/** Heading fragment including `#`, or empty. */
	heading: string;
	/**
	 * Display alias / alt text.
	 * `null` = no `|` / empty markdown alt was absent in a wiki sense (no pipe).
	 */
	alias: string | null;
	/** Raw matched text */
	raw: string;
}

function decodePath(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

function fromWikiMatch(match: RegExpMatchArray): EmbedMatch | null {
	const embedPrefix = match[1] === '!' ? '!' : '';
	const linkpathRaw = match[2]?.trim() ?? '';
	const heading = match[3] ?? '';
	const hasPipe = match[4] !== undefined;
	const alias = hasPipe ? (match[4] ?? '') : null;
	if (!linkpathRaw) return null;
	return {
		kind: 'wiki',
		embedPrefix,
		linkpath: decodePath(linkpathRaw),
		linkpathRaw,
		heading,
		alias,
		raw: match[0],
	};
}

function fromMarkdownMatch(match: RegExpMatchArray): EmbedMatch | null {
	const embedPrefix = match[1] === '!' ? '!' : '';
	const aliasRaw = match[2] ?? '';
	let linkpathRaw = (match[3] ?? '').trim();
	const titleSep = linkpathRaw.match(/^([^\s]+)(?:\s+".*")?$/);
	if (titleSep?.[1]) linkpathRaw = titleSep[1];
	if (!linkpathRaw) return null;
	return {
		kind: 'markdown',
		embedPrefix,
		linkpath: decodePath(linkpathRaw),
		linkpathRaw,
		heading: '',
		alias: aliasRaw.length > 0 ? aliasRaw : null,
		raw: match[0],
	};
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

	const wikiRe = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/;
	const mdRe = /(!?)\[([^\]]*)\]\(([^)\n]+)\)/;

	const anchoredWiki = trimmed.match(new RegExp(`^${wikiRe.source}`));
	if (anchoredWiki) {
		const result = fromWikiMatch(anchoredWiki);
		if (result) return result;
	}

	const anchoredMd = trimmed.match(new RegExp(`^${mdRe.source}`));
	if (anchoredMd) {
		const result = fromMarkdownMatch(anchoredMd);
		if (result) return result;
	}

	const looseWiki = trimmed.match(wikiRe);
	if (looseWiki) {
		const result = fromWikiMatch(looseWiki);
		if (result) return result;
	}

	const looseMd = trimmed.match(mdRe);
	if (looseMd) {
		const result = fromMarkdownMatch(looseMd);
		if (result) return result;
	}

	return null;
}

/**
 * Rebuild link source text after an alias edit (path left unchanged).
 * Empty alias removes the wiki pipe / clears markdown alt.
 */
export function rebuildEmbedWithAlias(
	embed: EmbedMatch,
	newAlias: string | null,
): string {
	const alias = newAlias?.trim() ? newAlias.trim() : '';

	if (embed.kind === 'wiki') {
		const target = `${embed.linkpathRaw}${embed.heading}`;
		if (alias) {
			return `${embed.embedPrefix}[[${target}|${alias}]]`;
		}
		return `${embed.embedPrefix}[[${target}]]`;
	}

	return `${embed.embedPrefix}[${alias}](${embed.linkpathRaw})`;
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

/** Basename stem from a raw link path (no folder, no extension). */
export function linkpathDisplayBase(linkpath: string): string {
	const leaf = linkpath.split(/[/\\]/).pop() ?? linkpath;
	return leaf.replace(/\.[^.]+$/, '') || leaf;
}
