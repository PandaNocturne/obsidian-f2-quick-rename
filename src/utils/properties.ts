import type { App, TFile } from 'obsidian';
import {
	flattenPropertyFieldConfigs,
	type PropertyFieldConfig,
	type PropertyFieldState,
	type PropertyFieldType,
	type PropertyPanelItem,
	type PropertySettingsItem,
	type PropertyValue,
} from '../settings';

function toDisplayString(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) {
		return value
			.map((item) => toDisplayString(item).trim())
			.filter((item) => item.length > 0)
			.join(', ');
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

export function readPropertyValue(
	raw: unknown,
	type: PropertyFieldType,
): PropertyValue {
	switch (type) {
		case 'checkbox':
			return Boolean(raw);
		case 'number': {
			if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
			if (Array.isArray(raw)) {
				const items = raw as unknown[];
				const first = items.find(
					(item) =>
						typeof item === 'number' ||
						(typeof item === 'string' && item.trim() !== ''),
				);
				if (first == null) return null;
				const n = typeof first === 'number' ? first : Number(first);
				return Number.isFinite(n) ? n : null;
			}
			if (raw == null || raw === '') return null;
			const n = Number(raw);
			return Number.isFinite(n) ? n : null;
		}
		case 'list':
			return asStringList(raw);
		case 'date':
		case 'datetime':
		case 'select':
		case 'text':
		default:
			// Arrays (e.g. former list properties) coerce to a joined string.
			return toDisplayString(raw);
	}
}

export function normalizePropertyValue(
	value: PropertyValue,
	type: PropertyFieldType,
): unknown {
	switch (type) {
		case 'checkbox':
			return Boolean(value);
		case 'number': {
			if (value === null || value === '' || value === undefined) {
				return undefined;
			}
			if (Array.isArray(value)) {
				const first = value.find((item) => String(item).trim());
				if (first == null) return undefined;
				const n = Number(first);
				return Number.isFinite(n) ? n : undefined;
			}
			const n = typeof value === 'number' ? value : Number(value);
			return Number.isFinite(n) ? n : undefined;
		}
		case 'list': {
			const list = Array.isArray(value)
				? value.map((item) => String(item).trim()).filter(Boolean)
				: asStringList(value);
			return list.length > 0 ? list : undefined;
		}
		case 'date':
		case 'datetime':
		case 'select':
		case 'text': {
			const text = Array.isArray(value)
				? value
						.map((item) => String(item).trim())
						.filter(Boolean)
						.join(', ')
				: value == null
					? ''
					: String(value).trim();
			return text.length > 0 ? text : undefined;
		}
		default:
			return undefined;
	}
}

export function getPropertyFieldConfigs(
	items: PropertySettingsItem[],
): PropertyFieldConfig[] {
	return flattenPropertyFieldConfigs(items);
}

function readFrontmatterValue(
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

function toFieldState(
	frontmatter: Record<string, unknown>,
	item: PropertyFieldConfig,
): PropertyFieldState | null {
	const key = item.key.trim();
	if (!key) return null;
	const value = readPropertyValue(
		readFrontmatterValue(frontmatter, key),
		item.type,
	);
	return {
		key,
		type: item.type,
		label: item.label?.trim() || key,
		showHint: item.showHint === true,
		multiline:
			item.type === 'text' &&
			(item.multiline === true || isMultilineTextValue(value)),
		value,
	};
}

export function buildPropertyPanelItems(
	app: App,
	file: TFile,
	items: PropertySettingsItem[],
): PropertyPanelItem[] {
	const frontmatter: Record<string, unknown> =
		app.metadataCache.getFileCache(file)?.frontmatter ?? {};

	const result: PropertyPanelItem[] = [];
	for (const item of items) {
		if (item.kind === 'separator') {
			result.push({ kind: 'separator', label: item.label });
			continue;
		}
		if (item.kind === 'row') {
			const fields = item.children
				.map((child) => toFieldState(frontmatter, child))
				.filter((field): field is PropertyFieldState => field != null);
			if (fields.length > 0) {
				result.push({ kind: 'row', fields });
			}
			continue;
		}
		const field = toFieldState(frontmatter, item);
		if (field) result.push({ kind: 'field', field });
	}
	return result;
}

/** @deprecated Prefer buildPropertyPanelItems */
export function buildPropertyStates(
	app: App,
	file: TFile,
	configs: PropertySettingsItem[],
): PropertyFieldState[] {
	const fields: PropertyFieldState[] = [];
	for (const item of buildPropertyPanelItems(app, file, configs)) {
		if (item.kind === 'field') fields.push(item.field);
		else if (item.kind === 'row') fields.push(...item.fields);
	}
	return fields;
}

export async function writePropertyValues(
	app: App,
	file: TFile,
	configs: PropertySettingsItem[],
	values: Record<string, PropertyValue>,
): Promise<void> {
	const byKey = new Map(
		getPropertyFieldConfigs(configs)
			.filter((cfg) => cfg.key.trim())
			.map((cfg) => [cfg.key.trim(), cfg] as const),
	);

	await app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(values)) {
				const cfg = byKey.get(key);
				if (!cfg) continue;
				const next = normalizePropertyValue(value, cfg.type);
				if (next === undefined) {
					delete frontmatter[key];
				} else {
					frontmatter[key] = next;
				}
			}
		},
	);
}

type MetadataTypeManagerLike = {
	getAssignedWidget?: (key: string) => string | null | undefined;
};

function widgetToFieldType(widget: string): PropertyFieldType | null {
	switch (widget) {
		case 'checkbox':
			return 'checkbox';
		case 'number':
			return 'number';
		case 'date':
			return 'date';
		case 'datetime':
			return 'datetime';
		case 'multitext':
		case 'tags':
		case 'aliases':
			return 'list';
		case 'text':
			return 'text';
		default:
			return null;
	}
}

/** Infer a panel field type from vault type memory and/or the stored value. */
export function inferPropertyType(
	app: App,
	key: string,
	value: unknown,
): PropertyFieldType {
	const manager = (
		app as App & { metadataTypeManager?: MetadataTypeManagerLike }
	).metadataTypeManager;
	const assigned = manager?.getAssignedWidget?.(key);
	if (assigned) {
		const mapped = widgetToFieldType(assigned);
		if (mapped) return mapped;
	}

	const lower = key.trim().toLowerCase();
	if (lower === 'tags' || lower === 'tag' || lower === 'aliases') {
		return 'list';
	}
	if (typeof value === 'boolean') return 'checkbox';
	if (typeof value === 'number' && Number.isFinite(value)) return 'number';
	if (Array.isArray(value)) return 'list';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'date';
		if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) {
			return 'datetime';
		}
	}
	return 'text';
}

/** Soft-wrap threshold: longer text uses a wrapping multiline editor. */
const MULTILINE_TEXT_LENGTH = 48;

/**
 * True when a text property should use a wrapping multiline editor:
 * contains newlines, or the content is long enough to overflow a single line.
 */
export function isMultilineTextValue(value: unknown): boolean {
	if (typeof value !== 'string') return false;
	if (/[\r\n]/.test(value)) return true;
	return value.trim().length >= MULTILINE_TEXT_LENGTH;
}

/** Estimate visible rows for a wrapping textarea (hard newlines + soft wrap). */
export function estimateMultilineRows(text: string, cols = 36): number {
	const chunks = text.length > 0 ? text.split(/\r?\n/) : [''];
	let rows = 0;
	for (const chunk of chunks) {
		rows += Math.max(1, Math.ceil(Math.max(chunk.length, 1) / cols));
	}
	return Math.min(12, Math.max(2, rows));
}

/**
 * Build editable states for configured property fields only (F2 panel).
 * Session-added properties are not included on the next open.
 */
export function buildConfiguredPropertyStates(
	app: App,
	file: TFile,
	items: PropertySettingsItem[],
): PropertyFieldState[] {
	const frontmatter: Record<string, unknown> = {
		...(app.metadataCache.getFileCache(file)?.frontmatter ?? {}),
	};
	delete (frontmatter as { position?: unknown }).position;

	const fields: PropertyFieldState[] = [];
	for (const cfg of getPropertyFieldConfigs(items)) {
		const key = cfg.key.trim();
		if (!key) continue;
		const raw = readFrontmatterValue(frontmatter, key);
		const value = readPropertyValue(raw, cfg.type);
		fields.push({
			key,
			type: cfg.type,
			label: cfg.label?.trim() || key,
			showHint: cfg.showHint === true,
			multiline:
				cfg.type === 'text' &&
				(cfg.multiline === true || isMultilineTextValue(value)),
			value,
		});
	}
	return fields;
}

/**
 * Build editable states for every frontmatter key on the note
 * (Obsidian-style full properties panel).
 */
export function buildFullPropertyStates(
	app: App,
	file: TFile,
): PropertyFieldState[] {
	const frontmatter: Record<string, unknown> = {
		...(app.metadataCache.getFileCache(file)?.frontmatter ?? {}),
	};
	delete (frontmatter as { position?: unknown }).position;

	const fields: PropertyFieldState[] = [];
	for (const [key, raw] of Object.entries(frontmatter)) {
		if (!key || key === 'position') continue;
		const type = inferPropertyType(app, key, raw);
		const value = readPropertyValue(raw, type);
		fields.push({
			key,
			type,
			label: key,
			showHint: type === 'list',
			multiline: type === 'text' && isMultilineTextValue(value),
			value,
		});
	}
	return fields;
}

/**
 * Rewrite note frontmatter from an ordered field list (supports add / delete / reorder).
 * Replaces the entire frontmatter block (F5).
 */
export async function writeFullFrontmatter(
	app: App,
	file: TFile,
	fields: PropertyFieldState[],
	values: Record<string, PropertyValue>,
): Promise<void> {
	await app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			for (const key of Object.keys(frontmatter)) {
				delete frontmatter[key];
			}
			for (const field of fields) {
				const key = field.key.trim();
				if (!key) continue;
				const raw =
					values[key] !== undefined ? values[key] : field.value;
				const next = normalizePropertyValue(raw, field.type);
				if (next === undefined) {
					delete frontmatter[key];
				} else {
					frontmatter[key] = next;
				}
			}
		},
	);
}

/**
 * Merge panel fields into frontmatter without wiping unrelated keys (F2).
 * `managedKeys` are keys this session owns (configured + previously added);
 * removed managed keys are deleted, other frontmatter keys are left alone.
 */
export async function writeMergedFrontmatter(
	app: App,
	file: TFile,
	fields: PropertyFieldState[],
	values: Record<string, PropertyValue>,
	managedKeys: string[],
): Promise<void> {
	const panelKeys = fields
		.map((field) => field.key.trim())
		.filter((key) => key.length > 0);
	const panelKeySet = new Set(panelKeys);
	const managed = new Set(
		[...managedKeys, ...panelKeys]
			.map((key) => key.trim())
			.filter((key) => key.length > 0),
	);

	await app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			for (const key of managed) {
				if (!panelKeySet.has(key)) {
					delete frontmatter[key];
				}
			}
			for (const field of fields) {
				const key = field.key.trim();
				if (!key) continue;
				const raw =
					values[key] !== undefined ? values[key] : field.value;
				const next = normalizePropertyValue(raw, field.type);
				if (next === undefined) {
					delete frontmatter[key];
				} else {
					frontmatter[key] = next;
				}
			}
		},
	);
}

