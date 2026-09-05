import {
	AbstractInputSuggest,
	App,
	getAllTags,
	prepareFuzzySearch,
} from 'obsidian';
import type { PropertyFieldType } from '../settings';
import {
	getActiveWikiLinkQuery,
	insertWikiLinkAtCursor,
	suggestWikiLinkTexts,
} from './wiki-link-suggest';

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
			.sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: 'base' }),
			);
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

function toDisplayString(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return '';
}

function asStringList(raw: unknown): string[] {
	if (raw == null) return [];
	if (Array.isArray(raw)) {
		return raw
			.map((item) => toDisplayString(item).trim())
			.filter((item) => item.length > 0);
	}
	if (typeof raw === 'string') {
		return raw
			.split(/[,\n]/)
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
	}
	const single = toDisplayString(raw).trim();
	return single ? [single] : [];
}

function readFrontmatterEntry(
	frontmatter: Record<string, unknown>,
	key: string,
): unknown {
	if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
		return frontmatter[key];
	}
	const lower = key.toLowerCase();
	for (const [entryKey, value] of Object.entries(frontmatter)) {
		if (entryKey.toLowerCase() === lower) return value;
	}
	return undefined;
}

/** Unique values used by a frontmatter key across the vault. */
export function collectPropertyListValues(app: App, key: string): string[] {
	const trimmed = key.trim();
	if (!trimmed) return [];

	if (resolvePropertyTypeAttr(trimmed, 'list') === 'tags') {
		return collectVaultTags(app);
	}

	const values = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) continue;
		for (const item of asStringList(
			readFrontmatterEntry(frontmatter, trimmed),
		)) {
			values.add(item);
		}
	}
	return [...values].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: 'base' }),
	);
}

export function normalizeTagName(tag: string): string {
	return tag.trim().replace(/^#+/, '');
}

/**
 * Live tag suggestions for a text input (Obsidian AbstractInputSuggest).
 * Also completes vault files when typing `[[`.
 */
export class TagInputSuggest extends AbstractInputSuggest<string> {
	private readonly inputEl: HTMLInputElement;
	private readonly getExcluded: () => Iterable<string>;
	private readonly onChoose: (tag: string) => void;
	private readonly sourcePath: string;
	private tagCache: string[] | null = null;
	private wikiMode = false;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		getExcluded: () => Iterable<string>,
		onChoose: (tag: string) => void,
		sourcePath = '',
	) {
		super(app, inputEl);
		this.inputEl = inputEl;
		this.getExcluded = getExcluded;
		this.onChoose = onChoose;
		this.sourcePath = sourcePath;
		this.limit = 30;
	}

	protected getSuggestions(query: string): string[] {
		const wiki = getActiveWikiLinkQuery(this.inputEl);
		if (wiki) {
			this.wikiMode = true;
			return suggestWikiLinkTexts(
				this.app,
				wiki.query,
				this.sourcePath,
				this.limit || 30,
			);
		}
		this.wikiMode = false;

		const needle = normalizeTagName(query).toLowerCase();
		const excluded = new Set(
			[...this.getExcluded()].map((t) =>
				normalizeTagName(t).toLowerCase(),
			),
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
		if (this.wikiMode || value.startsWith('[[')) {
			el.addClass('f2-rename-wiki-suggest-item');
			el.createSpan({ text: value });
			return;
		}
		el.addClass('f2-rename-tag-suggest-item');
		el.createSpan({ text: `#${value}` });
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		if (this.wikiMode || value.startsWith('[[')) {
			insertWikiLinkAtCursor(this.inputEl, value);
			this.close();
			return;
		}
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

/**
 * Suggest existing vault values for a list-type frontmatter property.
 * Also completes vault files when typing `[[`.
 */
export class ListValueSuggest extends AbstractInputSuggest<string> {
	private readonly inputEl: HTMLInputElement;
	private readonly propertyKey: string;
	private readonly getExcluded: () => Iterable<string>;
	private readonly onChoose: (value: string) => void;
	private readonly sourcePath: string;
	private valueCache: string[] | null = null;
	private wikiMode = false;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		propertyKey: string,
		getExcluded: () => Iterable<string>,
		onChoose: (value: string) => void,
		sourcePath = '',
		/** When false, keep the chosen value in the input (single-select). */
		private readonly clearOnChoose = true,
	) {
		super(app, inputEl);
		this.inputEl = inputEl;
		this.propertyKey = propertyKey;
		this.getExcluded = getExcluded;
		this.onChoose = onChoose;
		this.sourcePath = sourcePath;
		this.limit = 30;
	}

	protected getSuggestions(query: string): string[] {
		const wiki = getActiveWikiLinkQuery(this.inputEl);
		if (wiki) {
			this.wikiMode = true;
			return suggestWikiLinkTexts(
				this.app,
				wiki.query,
				this.sourcePath,
				this.limit || 30,
			);
		}
		this.wikiMode = false;

		const needle = query.trim().toLowerCase();
		const excluded = new Set(
			[...this.getExcluded()].map((item) => item.trim().toLowerCase()),
		);
		const values = this.getValueCache().filter(
			(item) => !excluded.has(item.toLowerCase()),
		);

		if (!needle) {
			return values.slice(0, this.limit || 30);
		}

		const fuzzy = prepareFuzzySearch(needle);
		const scored: { value: string; score: number }[] = [];
		for (const value of values) {
			const result = fuzzy(value);
			if (result) {
				scored.push({ value, score: result.score });
			} else if (value.toLowerCase().includes(needle)) {
				scored.push({ value, score: -1 });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map((item) => item.value);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		if (this.wikiMode || value.startsWith('[[')) {
			el.addClass('f2-rename-wiki-suggest-item');
			el.createSpan({ text: value });
			return;
		}
		el.addClass('f2-rename-list-suggest-item');
		el.createSpan({ text: value });
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		if (this.wikiMode || value.startsWith('[[')) {
			insertWikiLinkAtCursor(this.inputEl, value);
			this.close();
			return;
		}
		this.onChoose(value);
		if (this.clearOnChoose) {
			this.setValue('');
		} else {
			this.setValue(value);
		}
		this.close();
	}

	private getValueCache(): string[] {
		if (!this.valueCache) {
			this.valueCache = collectPropertyListValues(
				this.app,
				this.propertyKey,
			);
		}
		return this.valueCache;
	}
}

type PropertyInfoLike = {
	name?: string;
	type?: string;
	count?: number;
};

type MetadataTypeManagerLike = {
	properties?: Record<string, PropertyInfoLike>;
	/** Assigned widget types keyed by lowercase property name */
	types?: Record<string, string>;
	getAllProperties?: () => Record<string, PropertyInfoLike>;
	getAssignedType?: (property: string) => string | null;
	getPropertyInfo?: (property: string) => PropertyInfoLike;
};

type AppWithPropertyTypes = App & {
	metadataTypeManager?: MetadataTypeManagerLike;
};

/** Map Obsidian property widget types to our editor types. */
export function mapObsidianPropertyType(
	type: string | undefined | null,
): PropertyFieldType | undefined {
	if (!type) return undefined;
	switch (type) {
		case 'checkbox':
			return 'checkbox';
		case 'date':
			return 'date';
		case 'datetime':
			return 'datetime';
		case 'number':
			return 'number';
		case 'multitext':
		case 'tags':
		case 'aliases':
			return 'list';
		case 'text':
		case 'file':
		case 'folder':
			return 'text';
		default:
			return undefined;
	}
}

function inferTypeFromSample(raw: unknown): PropertyFieldType | undefined {
	if (raw == null) return undefined;
	if (typeof raw === 'boolean') return 'checkbox';
	if (typeof raw === 'number' && Number.isFinite(raw)) return 'number';
	if (Array.isArray(raw)) return 'list';
	if (typeof raw === 'string') {
		const text = raw.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'date';
		if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return 'datetime';
		return 'text';
	}
	return undefined;
}

/** Infer editor type from sample values of this key in the vault. */
export function inferPropertyTypeFromVault(
	app: App,
	key: string,
): PropertyFieldType | undefined {
	const trimmed = key.trim();
	if (!trimmed) return undefined;

	const counts = new Map<PropertyFieldType, number>();
	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) continue;
		const inferred = inferTypeFromSample(
			readFrontmatterEntry(frontmatter, trimmed),
		);
		if (!inferred) continue;
		counts.set(inferred, (counts.get(inferred) ?? 0) + 1);
		if (counts.size > 0) {
			const total = [...counts.values()].reduce((a, b) => a + b, 0);
			if (total >= 8) break;
		}
	}

	let best: PropertyFieldType | undefined;
	let bestCount = 0;
	for (const [type, count] of counts) {
		if (count > bestCount) {
			best = type;
			bestCount = count;
		}
	}
	return best;
}

/**
 * Resolve Obsidian's registered widget type string for a property key.
 * Keys in the type manager are usually lowercase.
 */
export function getRegisteredPropertyType(
	app: App,
	key: string,
): string | undefined {
	const trimmed = key.trim();
	if (!trimmed) return undefined;

	const normalized = trimmed.toLowerCase();
	if (normalized === 'tags') return 'tags';
	if (normalized === 'aliases') return 'aliases';

	const manager = (app as AppWithPropertyTypes).metadataTypeManager;
	if (!manager) return undefined;

	const assigned = manager.getAssignedType?.(trimmed);
	if (assigned) return assigned;

	const fromTypes =
		manager.types?.[trimmed] ?? manager.types?.[normalized];
	if (typeof fromTypes === 'string' && fromTypes) return fromTypes;

	const info = manager.getPropertyInfo?.(trimmed);
	if (info?.type) return info.type;

	const all = manager.getAllProperties?.();
	if (all) {
		const direct = all[trimmed] ?? all[normalized];
		if (direct?.type) return direct.type;
		for (const [name, entry] of Object.entries(all)) {
			if (name.toLowerCase() === normalized && entry.type) {
				return entry.type;
			}
		}
	}

	const props = manager.properties;
	if (props) {
		const direct = props[trimmed] ?? props[normalized];
		if (direct?.type) return direct.type;
		for (const [name, entry] of Object.entries(props)) {
			if (name.toLowerCase() === normalized && entry.type) {
				return entry.type;
			}
		}
	}

	return undefined;
}

/**
 * Best-effort editor type for a property key:
 * registered Obsidian type first, then infer from vault values.
 */
export function resolvePropertyFieldType(
	app: App,
	key: string,
): PropertyFieldType | undefined {
	const registered = mapObsidianPropertyType(
		getRegisteredPropertyType(app, key),
	);
	if (registered) return registered;
	return inferPropertyTypeFromVault(app, key);
}

/** Collect known frontmatter property names from the vault. */
export function collectVaultPropertyKeys(app: App): string[] {
	const keys = new Set<string>();
	const manager = (app as AppWithPropertyTypes).metadataTypeManager;

	const all = manager?.getAllProperties?.();
	if (all) {
		for (const [name, info] of Object.entries(all)) {
			const key = (info.name ?? name).trim();
			if (key) keys.add(key);
		}
	}

	const props = manager?.properties;
	if (props) {
		for (const [name, info] of Object.entries(props)) {
			const key = (info.name ?? name).trim();
			if (key) keys.add(key);
		}
	}

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) continue;
		for (const key of Object.keys(frontmatter)) {
			if (key === 'position') continue;
			keys.add(key);
		}
	}

	return [...keys].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: 'base' }),
	);
}

/**
 * Suggest vault property names for the settings “属性名” input.
 */
export class PropertyKeySuggest extends AbstractInputSuggest<string> {
	private readonly onChoose: (key: string) => void;
	private keyCache: string[] | null = null;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		onChoose: (key: string) => void,
	) {
		super(app, inputEl);
		this.onChoose = onChoose;
		this.limit = 40;
	}

	protected getSuggestions(query: string): string[] {
		const needle = query.trim().toLowerCase();
		const keys = this.getKeyCache();

		if (!needle) {
			return keys.slice(0, this.limit || 40);
		}

		const fuzzy = prepareFuzzySearch(needle);
		const scored: { key: string; score: number }[] = [];
		for (const key of keys) {
			const result = fuzzy(key);
			if (result) {
				scored.push({ key, score: result.score });
			} else if (key.toLowerCase().includes(needle)) {
				scored.push({ key, score: -1 });
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map((item) => item.key);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.addClass('f2-rename-property-key-suggest-item');
		el.createSpan({ text: value });
		const type =
			getRegisteredPropertyType(this.app, value) ??
			resolvePropertyFieldType(this.app, value);
		if (type) {
			el.createSpan({
				text: String(type),
				cls: 'f2-rename-property-key-suggest-type',
			});
		}
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		this.setValue(value);
		this.onChoose(value);
		this.close();
	}

	private getKeyCache(): string[] {
		if (!this.keyCache) {
			this.keyCache = collectVaultPropertyKeys(this.app);
		}
		return this.keyCache;
	}
}

/** Whether this property should use live tag suggestions. */
export function shouldSuggestTags(key: string): boolean {
	return resolvePropertyTypeAttr(key, 'list') === 'tags';
}

/**
 * Obsidian-aligned `data-property-type` value for a frontmatter field.
 * Special-cases `tags` / `aliases`; otherwise maps our editor types.
 */
export function resolvePropertyTypeAttr(
	key: string,
	type: PropertyFieldType,
): string {
	const normalized = key.trim().toLowerCase();
	if (normalized === 'tags') return 'tags';
	if (normalized === 'aliases') return 'aliases';
	switch (type) {
		case 'checkbox':
			return 'checkbox';
		case 'date':
			return 'date';
		case 'datetime':
			return 'datetime';
		case 'number':
			return 'number';
		case 'list':
			return 'multitext';
		case 'select':
		case 'text':
		default:
			return 'text';
	}
}
