import type { App, TFile } from 'obsidian';
import type {
	PropertyFieldConfig,
	PropertyFieldState,
	PropertyFieldType,
	PropertyValue,
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

export function buildPropertyStates(
	app: App,
	file: TFile,
	configs: PropertyFieldConfig[],
): PropertyFieldState[] {
	const frontmatter: Record<string, unknown> =
		app.metadataCache.getFileCache(file)?.frontmatter ?? {};

	return configs
		.filter((cfg) => cfg.key.trim().length > 0)
		.map((cfg) => {
			const key = cfg.key.trim();
			return {
				key,
				type: cfg.type,
				label: cfg.label?.trim() || key,
				hint: cfg.hint,
				value: readPropertyValue(frontmatter[key], cfg.type),
			};
		});
}

export async function writePropertyValues(
	app: App,
	file: TFile,
	configs: PropertyFieldConfig[],
	values: Record<string, PropertyValue>,
): Promise<void> {
	const byKey = new Map(
		configs
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
