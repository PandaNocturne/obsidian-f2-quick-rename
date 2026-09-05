import type { LocalePreference } from './i18n';
import { t } from './i18n';
import {
	DEFAULT_MODAL_MAX_HEIGHT,
	DEFAULT_MODAL_WIDTH,
} from './utils/css-size';

/** Obsidian-aligned property types (属性类型), plus plugin `select`. */
export type PropertyFieldType =
	| 'checkbox'
	| 'date'
	| 'datetime'
	| 'list'
	| 'number'
	| 'select'
	| 'text';

export interface PropertyTypeOption {
	type: PropertyFieldType;
	/** Lucide icon name used by setIcon */
	icon: string;
}

/** Same icons as Obsidian's property type menu; labels via `propertyTypeLabel`. */
export const PROPERTY_TYPE_OPTIONS: PropertyTypeOption[] = [
	{ type: 'checkbox', icon: 'check-square' },
	{ type: 'date', icon: 'calendar' },
	{ type: 'datetime', icon: 'clock' },
	{ type: 'list', icon: 'list' },
	{ type: 'number', icon: 'binary' },
	{ type: 'select', icon: 'circle-dot' },
	{ type: 'text', icon: 'align-left' },
];

export function propertyTypeLabel(type: PropertyFieldType): string {
	switch (type) {
		case 'checkbox':
			return t('propertyType.checkbox');
		case 'date':
			return t('propertyType.date');
		case 'datetime':
			return t('propertyType.datetime');
		case 'list':
			return t('propertyType.list');
		case 'number':
			return t('propertyType.number');
		case 'select':
			return t('propertyType.select');
		case 'text':
			return t('propertyType.text');
	}
}

/** List and select can show vault-value suggestions. */
export function propertyTypeSupportsHint(type: PropertyFieldType): boolean {
	return type === 'list' || type === 'select';
}

export interface PropertyFieldConfig {
	kind?: 'field';
	/** Frontmatter key, e.g. title / aliases / tags */
	key: string;
	type: PropertyFieldType;
	/** Display alias in the rename panel; defaults to key */
	label?: string;
	/**
	 * Whether list/select inputs show vault value suggestions (dropdown).
	 * Defaults to false.
	 */
	showHint?: boolean;
	/**
	 * Whether text inputs use a multiline textarea.
	 * Defaults to false.
	 */
	multiline?: boolean;
}

export interface PropertySeparatorConfig {
	kind: 'separator';
	/** Optional caption on the divider */
	label?: string;
}

/** Side-by-side group: children render on one row in the rename panel. */
export interface PropertyRowConfig {
	kind: 'row';
	/** Optional caption for settings UI */
	label?: string;
	children: PropertyFieldConfig[];
}

export type PropertySettingsItem =
	| PropertyFieldConfig
	| PropertySeparatorConfig
	| PropertyRowConfig;

export type PropertyValue = string | number | boolean | string[] | null;

export interface PropertyFieldState {
	key: string;
	type: PropertyFieldType;
	label: string;
	showHint: boolean;
	multiline: boolean;
	value: PropertyValue;
}

export type PropertyPanelItem =
	| { kind: 'field'; field: PropertyFieldState }
	| { kind: 'separator'; label?: string }
	| { kind: 'row'; fields: PropertyFieldState[] };

export interface F2RenameSettings {
	/**
	 * Plugin UI language.
	 * `system` follows Obsidian’s language; otherwise force zh-CN or en.
	 */
	locale: LocalePreference;
	/** When the cursor is on a wiki/markdown embed, rename that file. */
	renameEmbeds: boolean;
	/**
	 * When renaming an embed link, also show/edit the display alias
	 * (`![[file|alias]]` / `![alias](file)`).
	 */
	editEmbedAlias: boolean;
	/** When the selection/line is a heading, use Obsidian's rename-heading. */
	renameHeadings: boolean;
	/** Also rename same-folder files that share the basename (different ext). */
	renameCompanions: boolean;
	/** After renaming the active note, copy the new basename to the clipboard. */
	copyNameToClipboard: boolean;
	/** Show configured frontmatter fields under “更多” when renaming a note. */
	editProperties: boolean;
	/**
	 * Persist property edits immediately while the rename panel is open
	 * (no need to click confirm for attributes).
	 */
	autoSaveProperties: boolean;
	/**
	 * When true, the properties section in the rename panel starts collapsed.
	 * F5 full-properties mode still opens expanded.
	 */
	propertiesDefaultCollapsed: boolean;
	/**
	 * Double-click the extension suffix in the rename panel to edit it.
	 * Defaults to false.
	 */
	editExtension: boolean;
	/**
	 * Rename panel width. Comma-separated CSS lengths (px/vh/vw/…) use the
	 * minimum via CSS `min()`.
	 */
	modalWidth: string;
	/**
	 * Rename panel max height. Comma-separated CSS lengths use CSS `min()`.
	 */
	modalMaxHeight: string;
	/** Frontmatter keys / separators / rows editable in the rename panel. */
	propertyFields: PropertySettingsItem[];
}

export const DEFAULT_PROPERTY_FIELDS: PropertySettingsItem[] = [
	{
		kind: 'field',
		key: 'title',
		type: 'text',
		label: 'title',
		showHint: false,
		multiline: false,
	},
	{
		kind: 'field',
		key: 'aliases',
		type: 'list',
		label: 'aliases',
		showHint: true,
	},
	{
		kind: 'field',
		key: 'tags',
		type: 'list',
		label: 'tags',
		showHint: true,
	},
];

export const DEFAULT_SETTINGS: F2RenameSettings = {
	locale: 'system',
	renameEmbeds: true,
	editEmbedAlias: true,
	renameHeadings: true,
	renameCompanions: true,
	copyNameToClipboard: true,
	editProperties: true,
	autoSaveProperties: true,
	propertiesDefaultCollapsed: true,
	editExtension: false,
	modalWidth: DEFAULT_MODAL_WIDTH,
	modalMaxHeight: DEFAULT_MODAL_MAX_HEIGHT,
	propertyFields: DEFAULT_PROPERTY_FIELDS.map((item) =>
		clonePropertySettingsItem(item),
	),
};

export function isPropertyField(
	item: PropertySettingsItem,
): item is PropertyFieldConfig {
	return item.kind !== 'separator' && item.kind !== 'row';
}

export function isPropertyRow(
	item: PropertySettingsItem,
): item is PropertyRowConfig {
	return item.kind === 'row';
}

export function clonePropertySettingsItem(
	item: PropertySettingsItem,
): PropertySettingsItem {
	if (item.kind === 'separator') {
		return { ...item };
	}
	if (item.kind === 'row') {
		return {
			kind: 'row',
			label: item.label,
			children: item.children.map((child) => ({ ...child })),
		};
	}
	return { ...item };
}

export function normalizePropertyFieldConfig(
	raw: PropertyFieldConfig | Record<string, unknown>,
): PropertyFieldConfig {
	const record = raw as Record<string, unknown>;
	const rawType = typeof record.type === 'string' ? record.type : 'text';
	const type = PROPERTY_TYPE_OPTIONS.some((opt) => opt.type === rawType)
		? (rawType as PropertyFieldType)
		: 'text';
	return {
		kind: 'field',
		key: typeof record.key === 'string' ? record.key : '',
		type,
		label: typeof record.label === 'string' ? record.label : '',
		showHint: record.showHint === true && propertyTypeSupportsHint(type),
		multiline: record.multiline === true && type === 'text',
	};
}

export function normalizePropertySettingsItem(
	raw: PropertySettingsItem | Record<string, unknown>,
): PropertySettingsItem {
	const record = raw as Record<string, unknown>;
	if (record.kind === 'separator') {
		return {
			kind: 'separator',
			label: typeof record.label === 'string' ? record.label : '',
		};
	}
	if (record.kind === 'row') {
		const children = Array.isArray(record.children)
			? record.children.map((child) =>
					normalizePropertyFieldConfig(
						child as PropertyFieldConfig | Record<string, unknown>,
					),
				)
			: [];
		return {
			kind: 'row',
			label: typeof record.label === 'string' ? record.label : '',
			children,
		};
	}
	return normalizePropertyFieldConfig(record);
}

/** Flat list of editable field configs (walks row children). */
export function flattenPropertyFieldConfigs(
	items: PropertySettingsItem[],
): PropertyFieldConfig[] {
	const result: PropertyFieldConfig[] = [];
	for (const item of items) {
		if (item.kind === 'separator') continue;
		if (item.kind === 'row') {
			result.push(...item.children.filter((child) => child.key.trim()));
			continue;
		}
		if (item.key.trim()) result.push(item);
	}
	return result;
}

export function hasConfiguredPropertyFields(
	items: PropertySettingsItem[],
): boolean {
	return flattenPropertyFieldConfigs(items).length > 0;
}
