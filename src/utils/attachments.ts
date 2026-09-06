import { App, TFile, moment, normalizePath } from 'obsidian';
import {
	matchSelectionEmbed,
	normalizeSpaces,
	resolveEmbedFile,
} from './embed';

export const DEFAULT_ATTACHMENT_EXTENSIONS =
	'png,jpg,jpeg,avif,gif,webp,mp4,bmp,tif';

export const DEFAULT_ATTACHMENT_NAME_TEMPLATE =
	'File-{ctime:YYYYMMDDhhmmssSSS}';

export const DEFAULT_ATTACHMENT_RENAME_DELAY_MS = 500;

/** Parse a comma/space-separated extension list (no dots). */
export function parseAttachmentExtensions(raw: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const part of raw.split(/[,，\s]+/)) {
		const ext = part.trim().replace(/^\./, '').toLowerCase();
		if (!ext || seen.has(ext)) continue;
		seen.add(ext);
		result.push(ext);
	}
	return result;
}

export function isAttachmentFile(file: TFile, extensions: string[]): boolean {
	if (extensions.length === 0) return false;
	return extensions.includes(file.extension.toLowerCase());
}

/**
 * Collect unique attachment files linked/embedded from a note.
 * Uses metadata cache + getFirstLinkpathDest (more reliable than basename scan).
 */
export function collectNoteAttachments(
	app: App,
	note: TFile,
	extensions: string[],
): TFile[] {
	const cache = app.metadataCache.getFileCache(note);
	if (!cache) return [];

	const refs = [
		...(cache.embeds ?? []).map((e) => e.link),
		...(cache.links ?? []).map((l) => l.link),
	];

	const seen = new Set<string>();
	const files: TFile[] = [];
	for (const link of refs) {
		const linkpath = link.split('#')[0]?.trim() ?? '';
		if (!linkpath) continue;
		const dest = resolveEmbedFile(app, linkpath, note.path);
		if (!dest || !isAttachmentFile(dest, extensions)) continue;
		if (seen.has(dest.path)) continue;
		seen.add(dest.path);
		files.push(dest);
	}
	return files;
}

/** Resolve an attachment from a selection / current-line embed text. */
export function resolveAttachmentFromText(
	app: App,
	text: string,
	sourcePath: string,
	extensions: string[],
): TFile | null {
	const embed = matchSelectionEmbed(text);
	if (!embed || embed.linkpath.startsWith('http')) return null;
	const dest = resolveEmbedFile(app, embed.linkpath, sourcePath);
	if (!dest || !isAttachmentFile(dest, extensions)) return null;
	return dest;
}

/**
 * Expand a name template.
 * Tokens: `{ctime:format}`, `{mtime:format}`, `{name}`, `{ext}` (with leading dot).
 */
export function buildSuggestedBasename(
	file: TFile,
	template: string,
): string {
	const ext = file.extension ? `.${file.extension}` : '';
	const name = file.basename;
	let result = template;

	result = result.replace(/\{ctime(?::([^}]+))?\}/gi, (_m, fmt?: string) =>
		moment(file.stat.ctime).format(fmt || 'YYYYMMDDhhmmssSSS'),
	);
	result = result.replace(/\{mtime(?::([^}]+))?\}/gi, (_m, fmt?: string) =>
		moment(file.stat.mtime).format(fmt || 'YYYYMMDDhhmmssSSS'),
	);
	result = result.replace(/\{name\}/gi, () => name);
	result = result.replace(/\{ext\}/gi, () => ext);

	return normalizeSpaces(result.replace(new RegExp(`${escapeRegExp(ext)}$`, 'i'), ''));
}

/**
 * True when the file already looks like the expanded template for its ctime
 * (script-compatible skip for `File-{ctime:YYYYMMDDhhmmssSSS}`).
 */
export function alreadyMatchesTemplate(
	file: TFile,
	template: string,
): boolean {
	const suggested = buildSuggestedBasename(file, template);
	const ext = file.extension ? `.${file.extension}` : '';
	const expected = `${suggested}${ext}`;
	return file.name.toLowerCase() === expected.toLowerCase();
}

/**
 * Build a unique path in the same folder as `file` for `newBasename` + ext.
 * Appends `-1`, `-2`, … on collision (like the QuickAdd script).
 */
export function buildUniqueAttachmentPath(
	app: App,
	file: TFile,
	newBasename: string,
): string {
	const ext = file.extension ? `.${file.extension}` : '';
	const parent = file.parent?.path ?? '';
	const leaf = `${newBasename}${ext}`;
	let candidate = normalizePath(parent ? `${parent}/${leaf}` : leaf);
	if (candidate === file.path) return candidate;

	let suffix = 1;
	while (true) {
		const existing = app.vault.getAbstractFileByPath(candidate);
		if (!existing || existing.path === file.path) return candidate;
		const leafN = `${newBasename}-${suffix}${ext}`;
		candidate = normalizePath(parent ? `${parent}/${leafN}` : leafN);
		suffix += 1;
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
