import { AbstractInputSuggest, App, getAllTags, prepareFuzzySearch } from 'obsidian';

type MetadataCacheWithTags = App['metadataCache'] & {
	getTags?: () => Record<string, number>;
};

/** Collect vault tags without the leading `#`. */
export function collectVaultTags(app: App): string[] {
	const cache = app.metadataCache as MetadataCacheWithTags;
	const fromApi = cache.getTags?.();
	if (fromApi && Object.keys(fromApi).length > 0) {
		return Object.keys(fromApi)
			.map(normalizeTagName)
			.filter((tag) => tag.length > 0)
			.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	}

	const tags = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const fileCache = app.metadataCache.getFileCache(file);
		if (!fileCache) continue;
		const fileTags = getAllTags(fileCache);
		if (!fileTags) continue;
		for (const tag of fileTags) {
			const name = normalizeTagName(tag);
			if (name) tags.add(name);
		}
	}
	return [...tags].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: 'base' }),
	);
}

export function normalizeTagName(tag: string): string {
	return tag.trim().replace(/^#+/, '');
}

/**
 * Live tag suggestions for a text input (Obsidian AbstractInputSuggest).
 */
export class TagInputSuggest extends AbstractInputSuggest<string> {
	private readonly getExcluded: () => Iterable<string>;
	private readonly onChoose: (tag: string) => void;
	private tagCache: string[] | null = null;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		getExcluded: () => Iterable<string>,
		onChoose: (tag: string) => void,
	) {
		super(app, inputEl);
		this.getExcluded = getExcluded;
		this.onChoose = onChoose;
		this.limit = 30;
	}

	protected getSuggestions(query: string): string[] {
		const needle = normalizeTagName(query).toLowerCase();
		const excluded = new Set(
			[...this.getExcluded()].map((t) => normalizeTagName(t).toLowerCase()),
		);
		const tags = this.getTagCache().filter(
			(tag) => !excluded.has(tag.toLowerCase()),
		);

		if (!needle) {
			return tags.slice(0, this.limit || 30);
		}

		const fuzzy = prepareFuzzySearch(needle);
		const scored: { tag: string; score: number }[] = [];
		for (const tag of tags) {
			const result = fuzzy(tag);
			if (result) {
				scored.push({ tag, score: result.score });
			} else if (tag.toLowerCase().includes(needle)) {
				scored.push({ tag, score: -1 });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map((item) => item.tag);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.addClass('f2-rename-tag-suggest-item');
		el.createSpan({ text: `#${value}` });
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(normalizeTagName(value));
		this.setValue('');
		this.close();
	}

	private getTagCache(): string[] {
		if (!this.tagCache) {
			this.tagCache = collectVaultTags(this.app);
		}
		return this.tagCache;
	}
}

/** Whether this property should use live tag suggestions. */
export function shouldSuggestTags(key: string): boolean {
	return key.trim().toLowerCase() === 'tags';
}
