import type { App, TFile } from 'obsidian';
import {
	isPropertyField,
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
			if (raw == null || raw === '') return null;
			const n = Number(raw);
			return Number.isFinite(n) ? n : null;
		}
		case 'list':
			return asStringList(raw);
		case 'date':
		case 'datetime':
		case 'text':
		default:
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
		case 'text': {
			const text = value == null ? '' : String(value).trim();
			return text.length > 0 ? text : undefined;
		}
		default:
			return undefined;
	}
}

export function getPropertyFieldConfigs(
	items: PropertySettingsItem[],
): PropertyFieldConfig[] {
	return items.filter(isPropertyField);
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
		const key = item.key.trim();
		if (!key) continue;
		result.push({
			kind: 'field',
			field: {
				key,
				type: item.type,
				label: item.label?.trim() || key,
				showHint: item.showHint === true,
				value: readPropertyValue(frontmatter[key], item.type),
			},
		});
	}
	return result;
}

/** @deprecated Prefer buildPropertyPanelItems */
export function buildPropertyStates(
	app: App,
	file: TFile,
	configs: PropertySettingsItem[],
): PropertyFieldState[] {
	return buildPropertyPanelItems(app, file, configs)
		.filter(
			(item): item is { kind: 'field'; field: PropertyFieldState } =>
				item.kind === 'field',
		)
		.map((item) => item.field);
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
