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
	/** Frontmatter key, e.g. title / aliases / tags */
	key: string;
	type: PropertyFieldType;
	/** Optional UI label; defaults to key */
	label?: string;
	/** Placeholder hint, especially useful for list “添加…” */
	hint?: string;
}

export type PropertyValue = string | number | boolean | string[] | null;

export interface PropertyFieldState {
	key: string;
	type: PropertyFieldType;
	label: string;
	hint?: string;
	value: PropertyValue;
}

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
	/** Frontmatter keys editable in the rename panel. */
	propertyFields: PropertyFieldConfig[];
}

export const DEFAULT_PROPERTY_FIELDS: PropertyFieldConfig[] = [
	{ key: 'title', type: 'text', label: 'title', hint: '文档标题' },
	{
		key: 'aliases',
		type: 'list',
		label: 'aliases',
		hint: '添加别名',
	},
	{
		key: 'tags',
		type: 'list',
		label: 'tags',
		hint: '添加标签',
	},
];

export const DEFAULT_SETTINGS: F2RenameSettings = {
	renameEmbeds: true,
	editEmbedAlias: true,
	renameHeadings: true,
	renameCompanions: true,
	copyNameToClipboard: true,
	editProperties: true,
	propertyFields: DEFAULT_PROPERTY_FIELDS.map((f) => ({ ...f })),
};
