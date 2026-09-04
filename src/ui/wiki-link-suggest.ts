import {
	AbstractInputSuggest,
	App,
	TFile,
	prepareFuzzySearch,
} from 'obsidian';

export interface WikiLinkQueryContext {
	/** Index of the opening `[[` in the input value. */
	start: number;
	/** Text typed after `[[` up to the caret. */
	query: string;
	/** Caret position when the query was read. */
	cursor: number;
}

/**
 * Find an unclosed `[[…` fragment before the caret.
 * Returns null when the caret is not inside a wiki-link draft.
 */
export function getActiveWikiLinkQuery(
	el: HTMLInputElement | HTMLTextAreaElement,
): WikiLinkQueryContext | null {
	const value = el.value;
	const cursor = el.selectionStart ?? value.length;
	const before = value.slice(0, cursor);
	const open = before.lastIndexOf('[[');
	if (open < 0) return null;

	const afterOpen = before.slice(open + 2);
	if (afterOpen.includes(']]')) return null;
	// Avoid treating completed links elsewhere as open when typing after them.
	if (afterOpen.includes('\n')) return null;

	return { start: open, query: afterOpen, cursor };
}

export function buildWikiLinkText(
	app: App,
	file: TFile,
	sourcePath = '',
): string {
	const linktext = app.metadataCache.fileToLinktext(file, sourcePath, true);
	return `[[${linktext}]]`;
}

/** File wiki-link strings matching a query typed after `[[`. */
export function suggestWikiLinkTexts(
	app: App,
	query: string,
	sourcePath = '',
	limit = 30,
): string[] {
	const needle = query.trim().toLowerCase();
	const files = app.vault.getFiles();
	if (!needle) {
		return files
			.slice(0, limit)
			.map((file) => buildWikiLinkText(app, file, sourcePath));
	}

	const fuzzy = prepareFuzzySearch(needle);
	const scored: { file: TFile; score: number }[] = [];
	for (const file of files) {
		const path = file.path.toLowerCase();
		const name = file.basename.toLowerCase();
		const result = fuzzy(file.path) ?? fuzzy(file.basename);
		if (result) {
			scored.push({ file, score: result.score });
		} else if (path.includes(needle) || name.includes(needle)) {
			scored.push({ file, score: -1 });
		}
	}
	scored.sort((a, b) => b.score - a.score);
	return scored
		.slice(0, limit)
		.map((item) => buildWikiLinkText(app, item.file, sourcePath));
}

/**
 * Insert / complete a wiki link at the active `[[` draft in an input.
 * Returns the new caret index, or null if there was no active draft.
 */
export function insertWikiLinkAtCursor(
	el: HTMLInputElement | HTMLTextAreaElement,
	linkText: string,
): number | null {
	const ctx = getActiveWikiLinkQuery(el);
	if (!ctx) return null;

	const before = el.value.slice(0, ctx.start);
	const after = el.value.slice(ctx.cursor);
	const trimmedAfter = after.startsWith(']]') ? after.slice(2) : after;
	el.value = `${before}${linkText}${trimmedAfter}`;
	const caret = before.length + linkText.length;
	el.setSelectionRange(caret, caret);
	el.dispatchEvent(new Event('input', { bubbles: true }));
	return caret;
}

/**
 * Suggest vault files when the user types `[[` in an input / textarea.
 */
export class WikiLinkSuggest extends AbstractInputSuggest<TFile> {
	private readonly inputEl: HTMLInputElement | HTMLTextAreaElement;
	private readonly sourcePath: string;
	private readonly onInserted?: (value: string) => void;

	constructor(
		app: App,
		inputEl: HTMLInputElement | HTMLTextAreaElement,
		opts: {
			sourcePath?: string;
			onInserted?: (value: string) => void;
		} = {},
	) {
		// Runtime supports textarea; typings only list input | contenteditable.
		super(app, inputEl as HTMLInputElement);
		this.inputEl = inputEl;
		this.sourcePath = opts.sourcePath ?? '';
		this.onInserted = opts.onInserted;
		this.limit = 30;
	}

	protected getSuggestions(query: string): TFile[] {
		const ctx =
			getActiveWikiLinkQuery(this.inputEl) ??
			parseWikiLinkFromFullValue(query);
		if (!ctx) return [];

		const needle = ctx.query.trim().toLowerCase();
		const files = this.app.vault.getFiles();
		if (!needle) {
			return files.slice(0, this.limit || 30);
		}

		const fuzzy = prepareFuzzySearch(needle);
		const scored: { file: TFile; score: number }[] = [];
		for (const file of files) {
			const path = file.path.toLowerCase();
			const name = file.basename.toLowerCase();
			const result = fuzzy(file.path) ?? fuzzy(file.basename);
			if (result) {
				scored.push({ file, score: result.score });
			} else if (path.includes(needle) || name.includes(needle)) {
				scored.push({ file, score: -1 });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, this.limit || 30).map((item) => item.file);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.addClass('f2-rename-wiki-suggest-item');
		el.createDiv({ text: file.basename, cls: 'f2-rename-wiki-suggest-name' });
		if (file.parent && file.parent.path !== '/') {
			el.createDiv({
				text: file.path,
				cls: 'f2-rename-wiki-suggest-path',
			});
		} else if (file.extension !== 'md') {
			el.createDiv({
				text: file.name,
				cls: 'f2-rename-wiki-suggest-path',
			});
		}
	}

	selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		const linkText = buildWikiLinkText(this.app, file, this.sourcePath);
		const inserted = insertWikiLinkAtCursor(this.inputEl, linkText);
		if (inserted == null) {
			this.setValue(linkText);
			this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
		}
		this.onInserted?.(this.inputEl.value);
		this.close();
	}
}

/** Fallback when selectionStart is unavailable and only full value is passed. */
function parseWikiLinkFromFullValue(
	value: string,
): WikiLinkQueryContext | null {
	const open = value.lastIndexOf('[[');
	if (open < 0) return null;
	const afterOpen = value.slice(open + 2);
	if (afterOpen.includes(']]')) return null;
	return {
		start: open,
		query: afterOpen,
		cursor: value.length,
	};
}
