import { App, FileSystemAdapter, TFile } from 'obsidian';
import { normalizeTagName } from '../ui/tag-suggest';
import { isWebUrl } from './embed';

export type ValueLinkKind = 'tag' | 'url' | 'document' | 'text';

export interface ClassifiedValue {
	kind: ValueLinkKind;
	/** Text shown on the chip (may include `#`). */
	display: string;
	/** Payload used when opening (tag name / URL / linktext). */
	target: string;
	icon: string;
}

type SearchPluginInstance = {
	openGlobalSearch?: (query: string) => void;
};

type AppWithInternalPlugins = App & {
	internalPlugins?: {
		getPluginById?: (id: string) => {
			instance?: SearchPluginInstance;
		} | null;
	};
};

function stripWikiLink(raw: string): string {
	const trimmed = raw.trim();
	const match = trimmed.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
	if (!match) return trimmed;
	return (match[2] ?? match[1] ?? trimmed).trim();
}

function wikiLinkTarget(raw: string): string | null {
	const match = raw.trim().match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
	return match?.[1]?.trim() ?? null;
}

function normalizeUrl(raw: string): string {
	const trimmed = raw.trim();
	if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
	return trimmed;
}

/**
 * Classify a list / chip value as tag, URL, vault document, or plain text.
 */
export function classifyValue(
	app: App,
	raw: string,
	opts: {
		forceTag?: boolean;
		sourcePath?: string;
	} = {},
): ClassifiedValue {
	const trimmed = raw.trim();
	if (!trimmed) {
		return { kind: 'text', display: '', target: '', icon: 'type' };
	}

	if (opts.forceTag || trimmed.startsWith('#')) {
		const tag = normalizeTagName(trimmed);
		return {
			kind: 'tag',
			display: `#${tag}`,
			target: tag,
			icon: 'lucide-tags',
		};
	}

	const wikiTarget = wikiLinkTarget(trimmed);
	if (wikiTarget) {
		return {
			kind: 'document',
			display: stripWikiLink(trimmed),
			target: wikiTarget,
			icon: 'file-text',
		};
	}

	const asUrl = normalizeUrl(trimmed);
	if (isWebUrl(asUrl) || /^https?:\/\//i.test(asUrl)) {
		return {
			kind: 'url',
			display: trimmed,
			target: asUrl,
			icon: 'link',
		};
	}

	const sourcePath = opts.sourcePath ?? '';
	const dest = app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath);
	if (dest) {
		return {
			kind: 'document',
			display: trimmed,
			target: trimmed,
			icon: 'file-text',
		};
	}

	return {
		kind: 'text',
		display: trimmed,
		target: trimmed,
		icon: 'type',
	};
}

export async function openClassifiedValue(
	app: App,
	value: ClassifiedValue,
	sourcePath = '',
): Promise<void> {
	if (!value.target) return;

	switch (value.kind) {
		case 'tag':
			await openTagSearch(app, value.target);
			return;
		case 'url':
			window.open(value.target, '_blank');
			return;
		case 'document':
			await app.workspace.openLinkText(value.target, sourcePath, true);
			return;
		default:
			return;
	}
}

export async function openTagSearch(app: App, tag: string): Promise<void> {
	const name = normalizeTagName(tag);
	if (!name) return;

	const search = (app as AppWithInternalPlugins).internalPlugins?.getPluginById?.(
		'global-search',
	)?.instance;
	if (search?.openGlobalSearch) {
		search.openGlobalSearch(`tag:#${name}`);
		return;
	}

	await app.workspace.openLinkText(`#${name}`, '', false);
}

export async function openRelatedFile(
	app: App,
	file: TFile | null | undefined,
): Promise<void> {
	if (!file) return;
	await app.workspace.getLeaf(true).openFile(file);
}

type AppWithShowInFolder = App & {
	showInFolder?: (path: string) => void;
};

type ElectronWithShell = {
	shell?: { showItemInFolder?: (fullPath: string) => void };
};

/**
 * Reveal the file in the system file manager.
 * Prefer Obsidian desktop `app.showInFolder(filePath)` (must keep `this`).
 */
export function revealFileInSystemFolder(
	app: App,
	file: TFile | null | undefined,
): boolean {
	if (!file) return false;

	const desktopApp = app as AppWithShowInFolder;
	if (typeof desktopApp.showInFolder === 'function') {
		// Call as a method so `this` stays bound to App.
		desktopApp.showInFolder(file.path);
		return true;
	}

	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) return false;

	const fullPath = adapter.getFullPath(file.path);
	const nodeRequire = (
		window as Window & {
			require?: (id: string) => ElectronWithShell;
		}
	).require;
	if (typeof nodeRequire !== 'function') return false;

	try {
		const electron = nodeRequire('electron');
		const showItem = electron?.shell?.showItemInFolder;
		if (typeof showItem === 'function') {
			showItem(fullPath);
			return true;
		}
	} catch {
		// Mobile / restricted environments.
	}

	return false;
}

/**
 * Shortest vault wikilink for a file, e.g. `[[Note]]` or `[[folder/Note]]`.
 */
export function fileToWikilink(
	app: App,
	file: TFile,
	sourcePath = '',
): string {
	const linktext = app.metadataCache.fileToLinktext(file, sourcePath, true);
	return `[[${linktext}]]`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
	const value = text.trim();
	if (!value) return false;
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}
