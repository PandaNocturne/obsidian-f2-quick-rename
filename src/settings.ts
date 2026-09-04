/** Obsidian-aligned property types (属性类型). */
export type PropertyFieldType =
	| 'checkbox'
	| 'date'
	| 'datetime'
	| 'list'
	| 'number'
	| 'text';

export interface PropertyTypeOption {
	type: PropertyFieldType;
	label: string;
	/** Lucide icon name used by setIcon */
	icon: string;
}

/** Same labels as Obsidian's property type menu. */
export const PROPERTY_TYPE_OPTIONS: PropertyTypeOption[] = [
	{ type: 'checkbox', label: '复选框', icon: 'check-square' },
	{ type: 'date', label: '日期', icon: 'calendar' },
	{ type: 'datetime', label: '日期 & 时间', icon: 'clock' },
	{ type: 'list', label: '列表', icon: 'list' },
	{ type: 'number', label: '数字', icon: 'hash' },
	{ type: 'text', label: '文本', icon: 'align-left' },
];

export interface PropertyFieldConfig {
	kind?: 'field';
	/** Frontmatter key, e.g. title / aliases / tags */
	key: string;
	type: PropertyFieldType;
	/** Display alias in the rename panel; defaults to key */
	label?: string;
	/**
	 * Whether list inputs show vault value suggestions (dropdown).
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
	 * Double-click the extension suffix in the rename panel to edit it.
	 * Defaults to false.
	 */
	editExtension: boolean;
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
	renameEmbeds: true,
	editEmbedAlias: true,
	renameHeadings: true,
	renameCompanions: true,
	copyNameToClipboard: true,
	editProperties: true,
	autoSaveProperties: true,
	editExtension: false,
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
	return {
		kind: 'field',
		key: typeof record.key === 'string' ? record.key : '',
		type: (typeof record.type === 'string'
			? record.type
			: 'text') as PropertyFieldType,
		label: typeof record.label === 'string' ? record.label : '',
		showHint: record.showHint === true,
		multiline: record.multiline === true,
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
