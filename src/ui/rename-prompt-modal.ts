import { App, Modal, Notice, TFile, setIcon } from 'obsidian';
import { t } from '../i18n';
import type {
	PropertyFieldState,
	PropertyPanelItem,
	PropertyValue,
} from '../settings';
import { PROPERTY_TYPE_OPTIONS } from '../settings';
import {
	appendClassifiedChipPrefix,
	classifyValue,
	copyTextToClipboard,
	fileToWikilink,
	openClassifiedValue,
	openRelatedFile,
	revealFileInSystemFolder,
} from '../utils/value-links';
import {
	renameFileKindIcon,
	resolveRenameFileKind,
} from '../utils/embed';
import { buildFullPropertyStates } from '../utils/properties';
import { FullPropertiesPanel } from './full-properties-panel';
import {
	ListValueSuggest,
	TagInputSuggest,
	normalizeTagName,
	resolvePropertyTypeAttr,
	shouldSuggestTags,
} from './tag-suggest';
import { WikiLinkSuggest } from './wiki-link-suggest';

export interface RenamePromptResult {
	name: string;
	/** Present when the alias/title field was shown. */
	alias?: string;
	/**
	 * File extension including the leading dot (e.g. `.md`, `.excalidraw.md`).
	 * Omitted in `url` mode.
	 */
	extension?: string;
	/** Frontmatter values keyed by property name. */
	properties?: Record<string, PropertyValue>;
	/** Ordered full-properties fields (F5 panel) at submit time. */
	fullPropertyFields?: PropertyFieldState[];
}

export interface RenamePromptOptions {
	/**
	 * `file` — filename (+ optional alias) with extension suffix.
	 * `url` — title + URL fields for markdown web links.
	 */
	mode?: 'file' | 'url';
	/** Show and prefill the alias / title field. */
	showAlias?: boolean;
	alias?: string | null;
	aliasLabel?: string;
	/**
	 * File extension shown after the name input (e.g. `.md`, `.png`).
	 * Include the leading dot. Ignored in `url` mode.
	 */
	extension?: string;
	/** Allow double-clicking the extension suffix to edit it. */
	allowEditExtension?: boolean;
	/** Source path used to resolve wiki / note links in list chips. */
	sourcePath?: string;
	/** Related vault file (click label icon to open). */
	relatedFile?: TFile | null;
	/** Document properties / separators shown under the F2「属性」panel. */
	properties?: PropertyPanelItem[];
	/**
	 * Custom YAML properties editor (add / delete / reorder).
	 * When set at open (F5), replaces the configured properties section.
	 */
	fullProperties?: PropertyFieldState[];
	/** Open the configured properties section by default. */
	propertiesOpen?: boolean;
	/** Persist property edits immediately (default driven by settings). */
	autoSaveProperties?: boolean;
	/** Called when configured (非全量) properties change and auto-save is enabled. */
	onPropertiesChange?: (
		values: Record<string, PropertyValue>,
	) => void | Promise<void>;
	/** Called when full-properties panel changes (ordered fields + values). */
	onFullPropertiesChange?: (
		fields: PropertyFieldState[],
		values: Record<string, PropertyValue>,
	) => void | Promise<void>;
}

/**
 * Rename panel. Layout is sectioned so options / extras can be added later
 * without reshaping the header, field, or footer.
 */
export class RenamePromptModal extends Modal {
	private readonly titleText: string;
	private readonly defaultValue: string;
	private readonly options: RenamePromptOptions;
	private readonly onSubmit: (value: RenamePromptResult | null) => void;
	private value: string;
	private aliasValue: string;
	private extensionValue: string;
	private propertyValues: Record<string, PropertyValue> = {};
	private resolved = false;
	private inputEl: HTMLInputElement | null = null;
	private aliasInputEl: HTMLInputElement | null = null;
	private propertySaveTimer: number | null = null;
	private fullPropertiesPanel: FullPropertiesPanel | null = null;
	private configuredPropertiesEl: HTMLElement | null = null;
	private fullPropertiesEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private footerLeftEl: HTMLElement | null = null;
	private moreToggleBtn: HTMLButtonElement | null = null;
	private fullModeHeaderBtn: HTMLButtonElement | null = null;
	private propertiesVisible = false;
	private usingFullProperties = false;

	constructor(
		app: App,
		titleText: string,
		defaultValue: string,
		onSubmit: (value: RenamePromptResult | null) => void,
		options: RenamePromptOptions = {},
	) {
		super(app);
		this.titleText = titleText;
		this.defaultValue = defaultValue;
		this.value = defaultValue;
		this.options = options;
		this.aliasValue = options.alias ?? '';
		this.extensionValue = options.extension ?? '';
		this.onSubmit = onSubmit;

		for (const item of options.properties ?? []) {
			if (item.kind === 'field') {
				this.propertyValues[item.field.key] = this.cloneValue(
					item.field.value,
				);
			} else if (item.kind === 'row') {
				for (const field of item.fields) {
					this.propertyValues[field.key] = this.cloneValue(
						field.value,
					);
				}
			}
		}
		for (const field of options.fullProperties ?? []) {
			this.propertyValues[field.key] = this.cloneValue(field.value);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('f2-rename-modal');
		if (this.options.mode === 'url') {
			this.modalEl.addClass('f2-rename-modal-url');
		}

		const header = contentEl.createDiv({ cls: 'f2-rename-header' });
		const iconWrap = header.createDiv({ cls: 'f2-rename-icon' });
		const fileKind = resolveRenameFileKind(this.options.relatedFile, {
			mode: this.options.mode ?? 'file',
			extension: this.options.extension ?? this.extensionValue,
		});
		iconWrap.setAttr('data-file-kind', fileKind);
		setIcon(iconWrap, renameFileKindIcon(fileKind));
		header.createEl('h2', {
			text: this.titleText,
			cls: 'f2-rename-title',
		});
		this.renderHeaderActions(header);

		const body = contentEl.createDiv({ cls: 'f2-rename-body' });
		this.bodyEl = body;
		const form = body.createDiv({ cls: 'f2-rename-form' });

		const isUrl = this.options.mode === 'url';
		const showAlias = this.options.showAlias ?? isUrl;
		const relatedFile = this.options.relatedFile ?? null;

		const nameField = {
			id: 'f2-rename-input',
			label: isUrl
				? t('modal.field.urlLabel')
				: t('modal.field.filenameLabel'),
			value: this.defaultValue,
			suffix: isUrl ? undefined : this.options.extension,
			editableSuffix: Boolean(
				!isUrl &&
					this.options.allowEditExtension &&
					this.options.extension,
			),
			placeholder: isUrl ? 'https://…' : undefined,
			icon: isUrl ? 'link' : 'file-text',
			onIconClick: isUrl
				? () => {
						const url = this.value.trim();
						if (!url) {
							new Notice(t('notice.urlEmpty'));
							return;
						}
						void openClassifiedValue(
							this.app,
							classifyValue(this.app, url),
							this.options.sourcePath ?? '',
						);
					}
				: relatedFile
					? () => {
							void openRelatedFile(this.app, relatedFile);
						}
					: undefined,
		};

		const aliasField = showAlias
			? {
					id: 'f2-rename-alias-input',
					label:
						this.options.aliasLabel ??
						(isUrl
							? t('modal.aliasLabel.title')
							: t('modal.aliasLabel.alias')),
					value: this.aliasValue,
					placeholder: isUrl
						? t('modal.field.linkTitlePlaceholder')
						: t('modal.field.aliasPlaceholder'),
					icon: isUrl ? 'heading' : 'quote',
					onIconClick: isUrl
						? () => {
								const url = this.value.trim();
								if (!url) {
									new Notice(t('notice.urlEmpty'));
									return;
								}
								void openClassifiedValue(
									this.app,
									classifyValue(this.app, url),
									this.options.sourcePath ?? '',
								);
							}
						: undefined,
				}
			: null;

		if (isUrl && aliasField) {
			this.aliasInputEl = this.createTextField(form, aliasField, (v) => {
				this.aliasValue = v;
			});
			this.inputEl = this.createTextField(form, nameField, (v) => {
				this.value = v;
			});
		} else {
			this.inputEl = this.createTextField(form, nameField, (v) => {
				this.value = v;
			});
			if (aliasField) {
				this.aliasInputEl = this.createTextField(
					form,
					aliasField,
					(v) => {
						this.aliasValue = v;
					},
				);
			}
		}

		const properties = this.options.properties ?? [];
		const fullProperties = this.options.fullProperties;
		if (fullProperties) {
			this.usingFullProperties = true;
			this.renderFullPropertiesSection(body, fullProperties);
		} else if (properties.length > 0) {
			this.propertiesVisible = Boolean(this.options.propertiesOpen);
			this.renderConfiguredPropertiesSection(body, properties);
		}

		const footer = contentEl.createDiv({ cls: 'f2-rename-footer' });
		const left = footer.createDiv({ cls: 'f2-rename-footer-left' });
		this.footerLeftEl = left;
		const right = footer.createDiv({ cls: 'f2-rename-footer-right' });

		this.renderFooterLeftActions();

		const cancelBtn = right.createEl('button', {
			text: t('common.cancel'),
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		cancelBtn.addEventListener('click', () => this.submit(null));

		const confirmBtn = right.createEl('button', {
			text: t('common.confirm'),
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta',
			attr: { type: 'button' },
		});
		confirmBtn.addEventListener('click', () => this.submitResult());

		this.syncFullModeHeaderButton();

		window.setTimeout(() => {
			let focusEl = this.inputEl;
			if (isUrl) {
				focusEl = this.aliasValue
					? (this.aliasInputEl ?? this.inputEl)
					: this.inputEl;
			} else if (showAlias && this.aliasValue) {
				focusEl = this.aliasInputEl ?? this.inputEl;
			}
			focusEl?.focus();
			focusEl?.select();
		}, 50);
	}

	onClose(): void {
		if (this.propertySaveTimer !== null) {
			window.clearTimeout(this.propertySaveTimer);
			this.propertySaveTimer = null;
		}
		if (this.fullPropertiesPanel) {
			void this.fullPropertiesPanel.flush();
			this.fullPropertiesPanel.destroy();
			this.fullPropertiesPanel = null;
		} else if (this.options.autoSaveProperties) {
			void this.persistProperties(true);
		}
		const { contentEl } = this;
		contentEl.empty();
		this.inputEl = null;
		this.aliasInputEl = null;
		this.configuredPropertiesEl = null;
		this.fullPropertiesEl = null;
		this.bodyEl = null;
		this.footerLeftEl = null;
		this.moreToggleBtn = null;
		this.fullModeHeaderBtn = null;
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
	}

	private renderHeaderActions(header: HTMLElement): void {
		const actions = header.createDiv({ cls: 'f2-rename-header-actions' });
		const isUrl = this.options.mode === 'url';
		const file = this.options.relatedFile ?? null;

		if (isUrl) {
			this.createHeaderActionButton(actions, {
				icon: 'external-link',
				label: t('tooltip.openLink'),
				onClick: () => {
					const url = this.value.trim();
					if (!url) {
						new Notice(t('notice.urlEmpty'));
						return;
					}
					void openClassifiedValue(
						this.app,
						classifyValue(this.app, url),
						this.options.sourcePath ?? '',
					);
				},
			});
			this.createHeaderActionButton(actions, {
				icon: 'copy',
				label: t('header.copyWiki'),
				onClick: () => {
					void this.copyHeaderText(
						this.value.trim(),
						t('notice.copiedText'),
					);
				},
			});
			return;
		}

		this.createHeaderActionButton(actions, {
			icon: 'folder-open',
			label: t('header.openFolder'),
			disabled: !file,
			onClick: () => {
				if (!file) {
					new Notice(t('notice.noRelatedFile'));
					return;
				}
				if (!revealFileInSystemFolder(this.app, file)) {
					new Notice(t('notice.folderRevealUnavailable'));
				}
			},
		});

		this.createHeaderActionButton(actions, {
			icon: 'copy',
			label: t('header.copyWiki'),
			disabled: !file,
			onClick: () => {
				if (!file) {
					new Notice(t('notice.noRelatedFile'));
					return;
				}
				const wiki = fileToWikilink(
					this.app,
					file,
					this.options.sourcePath ?? file.path,
				);
				void this.copyHeaderText(wiki, t('notice.copiedWiki'));
			},
		});

		if (this.canToggleFullProperties()) {
			this.fullModeHeaderBtn = this.createHeaderActionButton(actions, {
				icon: 'list',
				label: t('header.fullProperties'),
				onClick: () => this.toggleFullPropertiesMode(),
			});
			this.syncFullModeHeaderButton();
		}
	}

	private createHeaderActionButton(
		parent: HTMLElement,
		opts: {
			icon: string;
			label: string;
			disabled?: boolean;
			onClick: () => void;
		},
	): HTMLButtonElement {
		const btn = parent.createEl('button', {
			cls: 'clickable-icon f2-rename-header-action',
			attr: {
				type: 'button',
				title: opts.label,
				'aria-label': opts.label,
			},
		});
		if (opts.disabled) {
			btn.disabled = true;
			btn.addClass('is-disabled');
		}
		setIcon(btn, opts.icon);
		btn.addEventListener('click', (evt) => {
			evt.preventDefault();
			if (btn.disabled) return;
			opts.onClick();
		});
		return btn;
	}

	private async copyHeaderText(
		text: string,
		successNotice = t('notice.copiedWiki'),
	): Promise<void> {
		const ok = await copyTextToClipboard(text);
		new Notice(ok ? successNotice : t('notice.copyFailed'));
	}

	private renderFullPropertiesSection(
		parent: HTMLElement,
		fields: PropertyFieldState[],
	): void {
		const section = parent.createDiv({
			cls: 'f2-rename-props-panel f2-rename-props-panel-full',
		});
		this.fullPropertiesEl = section;
		this.fullPropertiesPanel = new FullPropertiesPanel({
			app: this.app,
			fields,
			sourcePath: this.getSuggestSourcePath(),
			autoSave: Boolean(
				this.options.autoSaveProperties &&
					this.options.onFullPropertiesChange,
			),
			onChange: async (nextFields, values) => {
				for (const [key, value] of Object.entries(values)) {
					this.propertyValues[key] = this.cloneValue(value);
				}
				if (this.options.onFullPropertiesChange) {
					await this.options.onFullPropertiesChange(
						nextFields,
						values,
					);
				}
			},
		});
		this.fullPropertiesPanel.mount(section);
	}

	private renderAddPropertyButton(parent: HTMLElement): void {
		const addBtn = parent.createEl('button', {
			cls: 'f2-rename-btn f2-rename-btn-add-prop',
			attr: { type: 'button' },
		});
		const addIcon = addBtn.createSpan({
			cls: 'f2-rename-btn-add-prop-icon',
		});
		setIcon(addIcon, 'plus');
		addBtn.createSpan({ text: t('modal.addProperty') });
		addBtn.addEventListener('click', () => this.handleAddProperty());
	}

	private renderFooterLeftActions(): void {
		const left = this.footerLeftEl;
		if (!left) return;
		left.empty();
		this.moreToggleBtn = null;

		if (this.usingFullProperties) {
			this.renderAddPropertyButton(left);
			return;
		}

		if ((this.options.properties?.length ?? 0) > 0) {
			this.moreToggleBtn = left.createEl('button', {
				cls: 'f2-rename-btn f2-rename-btn-more',
				attr: { type: 'button' },
			});
			this.syncMoreToggleButton();
			this.moreToggleBtn.addEventListener('click', () => {
				this.setConfiguredPropertiesVisible(!this.propertiesVisible);
			});
		}
	}

	private handleAddProperty(): void {
		if (this.fullPropertiesPanel) {
			this.fullPropertiesPanel.addProperty();
			return;
		}

		new Notice(t('notice.addPropertyUnsupported'));
	}

	private canToggleFullProperties(): boolean {
		const file = this.options.relatedFile;
		if (!file || file.extension !== 'md') return false;
		return (
			(this.options.properties?.length ?? 0) > 0 ||
			Boolean(this.options.fullProperties)
		);
	}

	private toggleFullPropertiesMode(): void {
		if (this.usingFullProperties) {
			this.switchToConfiguredProperties();
		} else {
			this.switchToFullProperties();
		}
	}

	private syncFullModeHeaderButton(): void {
		const btn = this.fullModeHeaderBtn;
		if (!btn) return;
		btn.toggleClass('is-active', this.usingFullProperties);
		btn.setAttr(
			'aria-pressed',
			this.usingFullProperties ? 'true' : 'false',
		);
	}

	/**
	 * Switch F2 configured panel → F5 full YAML panel in the same dialog.
	 */
	private switchToFullProperties(): void {
		if (this.usingFullProperties) return;
		const file = this.options.relatedFile;
		const body = this.bodyEl;
		if (!file || !body) {
			new Notice(t('notice.fullPropertiesMarkdownOnly'));
			return;
		}
		if (file.extension !== 'md') {
			new Notice(t('notice.fullPropertiesMarkdownOnly'));
			return;
		}

		if (this.propertySaveTimer !== null) {
			window.clearTimeout(this.propertySaveTimer);
			this.propertySaveTimer = null;
		}

		this.configuredPropertiesEl?.remove();
		this.configuredPropertiesEl = null;
		this.usingFullProperties = true;

		const fields = this.buildFieldsForFullSwitch(file);
		this.renderFullPropertiesSection(body, fields);
		this.renderFooterLeftActions();
		this.syncFullModeHeaderButton();

		if (
			this.options.autoSaveProperties &&
			this.options.onFullPropertiesChange &&
			this.fullPropertiesPanel
		) {
			const snapshot = this.fullPropertiesPanel.getSnapshot();
			void this.options.onFullPropertiesChange(
				snapshot.fields,
				snapshot.values,
			);
		}

		this.fullPropertiesEl?.scrollIntoView({
			block: 'nearest',
			behavior: 'smooth',
		});
	}

	/**
	 * Switch F5 full panel → F2 configured properties panel.
	 */
	private switchToConfiguredProperties(): void {
		if (!this.usingFullProperties) return;
		const body = this.bodyEl;
		const properties = this.options.properties ?? [];
		if (!body || properties.length === 0) {
			this.usingFullProperties = false;
			this.syncFullModeHeaderButton();
			return;
		}

		if (this.fullPropertiesPanel) {
			const snapshot = this.fullPropertiesPanel.getSnapshot();
			for (const [key, value] of Object.entries(snapshot.values)) {
				this.propertyValues[key] = this.cloneValue(value);
			}
			if (
				this.options.autoSaveProperties &&
				this.options.onFullPropertiesChange
			) {
				void this.fullPropertiesPanel.flush();
			}
			this.fullPropertiesPanel.destroy();
			this.fullPropertiesPanel = null;
		}
		this.fullPropertiesEl?.remove();
		this.fullPropertiesEl = null;

		this.usingFullProperties = false;
		this.propertiesVisible = true;
		this.renderConfiguredPropertiesSection(body, properties);
		this.renderFooterLeftActions();
		this.syncFullModeHeaderButton();

		this.configuredPropertiesEl?.scrollIntoView({
			block: 'nearest',
			behavior: 'smooth',
		});
	}

	private buildFieldsForFullSwitch(file: TFile): PropertyFieldState[] {
		const fields = buildFullPropertyStates(this.app, file);
		const byKey = new Map(fields.map((field) => [field.key, field]));

		for (const field of this.collectConfiguredFields()) {
			const edited = this.propertyValues[field.key];
			const value =
				edited !== undefined
					? this.cloneValue(edited)
					: this.cloneValue(field.value);
			const existing = byKey.get(field.key);
			if (existing) {
				existing.value = value;
				continue;
			}
			const next: PropertyFieldState = {
				key: field.key,
				type: field.type,
				label: field.key,
				showHint: field.showHint,
				multiline: field.multiline,
				value,
			};
			fields.push(next);
			byKey.set(field.key, next);
		}

		for (const [key, value] of Object.entries(this.propertyValues)) {
			const existing = byKey.get(key);
			if (existing) {
				existing.value = this.cloneValue(value);
			}
		}

		return fields;
	}

	private collectConfiguredFields(): PropertyFieldState[] {
		const fields: PropertyFieldState[] = [];
		for (const item of this.options.properties ?? []) {
			if (item.kind === 'field') fields.push(item.field);
			else if (item.kind === 'row') fields.push(...item.fields);
		}
		return fields;
	}

	private renderConfiguredPropertiesSection(
		parent: HTMLElement,
		properties: PropertyPanelItem[],
	): void {
		const section = parent.createDiv({
			cls: 'f2-rename-props-panel f2-rename-props-panel-configured',
		});
		this.configuredPropertiesEl = section;
		section.toggleClass('is-open', this.propertiesVisible);
		section.setAttr(
			'aria-hidden',
			this.propertiesVisible ? 'false' : 'true',
		);

		const form = section.createDiv({ cls: 'f2-rename-form' });

		for (const item of properties) {
			if (item.kind === 'separator') {
				this.renderPropertySeparator(form, item.label);
				continue;
			}
			if (item.kind === 'row') {
				const row = form.createDiv({ cls: 'f2-rename-prop-row' });
				for (const field of item.fields) {
					const cell = row.createDiv({
						cls: 'f2-rename-prop-row-cell',
					});
					this.renderPropertyField(cell, field);
				}
				continue;
			}
			this.renderPropertyField(form, item.field);
		}
	}

	private setConfiguredPropertiesVisible(visible: boolean): void {
		this.propertiesVisible = visible;
		this.configuredPropertiesEl?.toggleClass('is-open', visible);
		this.configuredPropertiesEl?.setAttr(
			'aria-hidden',
			visible ? 'false' : 'true',
		);
		this.syncMoreToggleButton();
		if (visible) {
			this.configuredPropertiesEl?.scrollIntoView({
				block: 'nearest',
				behavior: 'smooth',
			});
		}
	}

	private syncMoreToggleButton(): void {
		const btn = this.moreToggleBtn;
		if (!btn) return;
		btn.setText(t('modal.section.properties'));
		btn.toggleClass('f2-rename-btn-primary', this.propertiesVisible);
		btn.toggleClass('mod-cta', this.propertiesVisible);
		btn.toggleClass('is-active', this.propertiesVisible);
		btn.setAttr(
			'aria-expanded',
			this.propertiesVisible ? 'true' : 'false',
		);
	}

	private renderPropertySeparator(
		parent: HTMLElement,
		label?: string,
	): void {
		const row = parent.createDiv({ cls: 'f2-rename-prop-separator' });
		row.createDiv({ cls: 'f2-rename-prop-separator-line' });
		if (label?.trim()) {
			row.createSpan({
				text: label.trim(),
				cls: 'f2-rename-prop-separator-label',
			});
			row.createDiv({ cls: 'f2-rename-prop-separator-line' });
		}
	}

	private renderPropertyField(
		parent: HTMLElement,
		field: PropertyFieldState,
	): void {
		const typeMeta = PROPERTY_TYPE_OPTIONS.find(
			(o) => o.type === field.type,
		);

		switch (field.type) {
			case 'checkbox':
				this.renderCheckboxField(parent, field, typeMeta?.icon);
				break;
			case 'list':
				this.renderListField(parent, field, typeMeta?.icon);
				break;
			case 'number':
				this.renderNumberField(parent, field, typeMeta?.icon);
				break;
			case 'date':
				this.renderInputProperty(
					parent,
					field,
					'date',
					typeMeta?.icon,
				);
				break;
			case 'datetime':
				this.renderInputProperty(
					parent,
					field,
					'datetime-local',
					typeMeta?.icon,
				);
				break;
			case 'text':
			default:
				if (field.multiline) {
					this.renderMultilineTextField(
						parent,
						field,
						typeMeta?.icon,
					);
				} else {
					this.renderInputProperty(
						parent,
						field,
						'text',
						typeMeta?.icon,
					);
				}
				break;
		}
	}

	private renderMultilineTextField(
		parent: HTMLElement,
		field: PropertyFieldState,
		icon?: string,
	): void {
		const row = this.createPropertyRow(parent, field, icon);
		row.addClass('f2-rename-field-multiline');
		const control = row.createDiv({ cls: 'f2-rename-control' });
		const textarea = control.createEl('textarea', {
			cls: 'f2-rename-input f2-rename-textarea',
			attr: {
				id: `f2-prop-${field.key}`,
				spellcheck: 'false',
				rows: '3',
				...(field.showHint && field.label
					? { placeholder: field.label }
					: {}),
			},
		});
		const current = this.propertyValues[field.key];
		textarea.value = current == null ? '' : String(current);
		textarea.addEventListener('input', () => {
			this.propertyValues[field.key] = textarea.value;
			this.schedulePersistProperties();
		});
		textarea.addEventListener('change', () => {
			void this.persistProperties(true);
		});
		textarea.addEventListener('keydown', (evt) => {
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.submit(null);
			}
		});
		this.attachWikiLinkSuggest(textarea, (value) => {
			this.propertyValues[field.key] = value;
			this.schedulePersistProperties();
		});
	}

	private renderCheckboxField(
		parent: HTMLElement,
		field: PropertyFieldState,
		icon?: string,
	): void {
		const row = this.createPropertyRow(parent, field, icon);
		const control = row.createDiv({ cls: 'f2-rename-control' });
		const input = control.createEl('input', {
			type: 'checkbox',
			cls: 'f2-rename-checkbox',
			attr: { id: `f2-prop-${field.key}` },
		});
		input.checked = Boolean(this.propertyValues[field.key]);
		input.addEventListener('change', () => {
			this.propertyValues[field.key] = input.checked;
			void this.persistProperties(true);
		});
	}

	private renderNumberField(
		parent: HTMLElement,
		field: PropertyFieldState,
		icon?: string,
	): void {
		const row = this.createPropertyRow(parent, field, icon);
		const control = row.createDiv({ cls: 'f2-rename-control' });
		const input = control.createEl('input', {
			type: 'number',
			cls: 'f2-rename-input',
			attr: {
				id: `f2-prop-${field.key}`,
				spellcheck: 'false',
			},
		});
		const current = this.propertyValues[field.key];
		input.value =
			current === null || current === undefined ? '' : String(current);
		input.addEventListener('input', () => {
			const raw = input.value.trim();
			this.propertyValues[field.key] =
				raw === '' ? null : Number(raw);
			this.schedulePersistProperties();
		});
		input.addEventListener('change', () => {
			void this.persistProperties(true);
		});
		this.bindEscape(input);
	}

	private renderInputProperty(
		parent: HTMLElement,
		field: PropertyFieldState,
		inputType: string,
		icon?: string,
	): void {
		const row = this.createPropertyRow(parent, field, icon);
		const control = row.createDiv({ cls: 'f2-rename-control' });
		const input = control.createEl('input', {
			type: inputType,
			cls: 'f2-rename-input',
			attr: {
				id: `f2-prop-${field.key}`,
				spellcheck: 'false',
				autocomplete: 'off',
				...(field.showHint
					? { placeholder: field.label }
					: {}),
			},
		});
		const current = this.propertyValues[field.key];
		let display = current == null ? '' : String(current);
		if (field.type === 'datetime' && display) {
			// datetime-local wants YYYY-MM-DDTHH:mm
			display = display.replace(' ', 'T').slice(0, 16);
		}
		input.value = display;
		input.addEventListener('input', () => {
			this.propertyValues[field.key] = input.value;
			this.schedulePersistProperties();
		});
		input.addEventListener('change', () => {
			void this.persistProperties(true);
		});
		this.bindEscape(input);
		if (inputType === 'text') {
			this.attachWikiLinkSuggest(input, (value) => {
				this.propertyValues[field.key] = value;
				this.schedulePersistProperties();
			});
		}
	}

	private renderListField(
		parent: HTMLElement,
		field: PropertyFieldState,
		icon?: string,
	): void {
		const propertyType = resolvePropertyTypeAttr(field.key, field.type);
		const isTags = propertyType === 'tags';

		const wrap = parent.createDiv({
			cls: 'f2-rename-list-field',
			attr: {
				'data-property-type': propertyType,
				'data-property-key': field.key,
			},
		});

		const head = wrap.createDiv({ cls: 'f2-rename-field f2-rename-list-head' });
		const label = head.createEl('label', {
			cls: 'f2-rename-label f2-rename-prop-label',
			attr: { for: `f2-prop-${field.key}` },
		});
		const typeMeta = PROPERTY_TYPE_OPTIONS.find((o) => o.type === field.type);
		const iconName = isTags ? 'lucide-tags' : (icon ?? typeMeta?.icon);
		if (iconName) {
			const iconEl = label.createSpan({ cls: 'f2-rename-prop-icon' });
			setIcon(iconEl, iconName);
		}
		label.createSpan({ text: field.label });

		const control = head.createDiv({ cls: 'f2-rename-control' });
		const input = control.createEl('input', {
			type: 'text',
			cls: 'f2-rename-input f2-rename-list-input',
			attr: {
				id: `f2-prop-${field.key}`,
				spellcheck: 'false',
				autocomplete: 'off',
				'data-property-type': propertyType,
				...(field.showHint
					? { placeholder: field.label }
					: {}),
			},
		});

		const chips = wrap.createDiv({
			cls: 'f2-rename-list-chips',
			attr: { 'data-property-type': propertyType },
		});

		const useTagSuggest = isTags || shouldSuggestTags(field.key);
		let suggestPicked = false;

		const getList = (): string[] => {
			const value = this.propertyValues[field.key];
			return Array.isArray(value) ? [...value] : [];
		};

		const setList = (next: string[]): void => {
			this.propertyValues[field.key] = next;
			renderChips();
			void this.persistProperties(true);
		};

		const renderChips = (): void => {
			chips.empty();
			const sourcePath =
				this.options.sourcePath ??
				this.options.relatedFile?.path ??
				'';
			for (const [index, item] of getList().entries()) {
				const classified = classifyValue(this.app, item, {
					forceTag: useTagSuggest,
					sourcePath,
				});
				const chip = chips.createSpan({
					cls: [
						'f2-rename-chip',
						classified.kind !== 'text'
							? `is-${classified.kind}`
							: '',
					]
						.filter(Boolean)
						.join(' '),
					attr: {
						title:
							classified.kind === 'text'
								? t('tooltip.doubleClickToEdit')
								: t('tooltip.clickIconOpenDoubleClickEdit'),
						'data-property-type': propertyType,
						'data-value-kind': classified.kind,
					},
				});

				const prefix = appendClassifiedChipPrefix(chip, classified, {
					app: this.app,
					sourcePath,
				});

				const textEl = chip.createSpan({
					cls: 'f2-rename-chip-text',
				});
				textEl.setText(classified.display);

				const beginEdit = (): void => {
					if (chip.hasClass('is-editing')) return;
					chip.addClass('is-editing');
					chip.removeAttribute('title');
					remove.hide();

					textEl.setAttr('contenteditable', 'true');
					textEl.setAttr('spellcheck', 'false');
					textEl.setAttr('role', 'textbox');
					textEl.setText(classified.display);
					prefix.hide();

					let closed = false;
					const finish = (action: () => void): void => {
						if (closed) return;
						closed = true;
						action();
					};

					const commit = (): void => {
						finish(() => {
							const raw = textEl.getText();
							const next = useTagSuggest
								? normalizeTagName(raw)
								: raw.trim();
							const list = getList();
							if (!next) {
								list.splice(index, 1);
								setList(list);
								return;
							}
							const duplicate = list.some(
								(other, i) =>
									i !== index &&
									(other.toLowerCase() ===
										next.toLowerCase() ||
										normalizeTagName(
											other,
										).toLowerCase() === next.toLowerCase()),
							);
							if (duplicate) {
								closed = false;
								new Notice(t('notice.duplicateListItem'));
								textEl.focus();
								return;
							}
							list[index] = next;
							setList(list);
						});
					};

					const cancel = (): void => {
						finish(() => renderChips());
					};

					const onKeyDown = (evt: KeyboardEvent): void => {
						if (evt.key === 'Enter') {
							evt.preventDefault();
							evt.stopPropagation();
							commit();
						} else if (evt.key === 'Escape') {
							evt.preventDefault();
							evt.stopPropagation();
							cancel();
						}
					};
					const onBlur = (): void => {
						window.setTimeout(() => commit(), 0);
					};

					textEl.addEventListener('keydown', onKeyDown);
					textEl.addEventListener('blur', onBlur);

					textEl.focus();
					const selection = window.getSelection();
					if (selection) {
						const range = activeDocument.createRange();
						range.selectNodeContents(textEl);
						selection.removeAllRanges();
						selection.addRange(range);
					}
				};

				chip.addEventListener('dblclick', (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					beginEdit();
				});

				const remove = chip.createEl('button', {
					cls: 'f2-rename-chip-remove',
					attr: { type: 'button', 'aria-label': t('common.remove') },
				});
				setIcon(remove, 'x');
				remove.addEventListener('click', (evt) => {
					evt.stopPropagation();
					const list = getList();
					list.splice(index, 1);
					setList(list);
				});
				remove.addEventListener('dblclick', (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
				});
			}
		};

		const addItemValue = (raw: string): void => {
			const text = useTagSuggest
				? normalizeTagName(raw)
				: raw.trim();
			if (!text) return;
			const list = getList();
			const exists = list.some(
				(item) =>
					item.toLowerCase() === text.toLowerCase() ||
					normalizeTagName(item).toLowerCase() === text.toLowerCase(),
			);
			if (!exists) {
				list.push(text);
				setList(list);
			}
			input.value = '';
		};

		const addItem = (): void => {
			addItemValue(input.value);
		};

		if (field.showHint) {
			const sourcePath = this.getSuggestSourcePath();
			if (useTagSuggest) {
				new TagInputSuggest(
					this.app,
					input,
					() => getList(),
					(tag) => {
						suggestPicked = true;
						addItemValue(tag);
					},
					sourcePath,
				);
			} else {
				new ListValueSuggest(
					this.app,
					input,
					field.key,
					() => getList(),
					(value) => {
						suggestPicked = true;
						addItemValue(value);
					},
					sourcePath,
				);
			}
		} else {
			this.attachWikiLinkSuggest(input);
		}

		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				evt.stopPropagation();
				window.setTimeout(() => {
					if (suggestPicked) {
						suggestPicked = false;
						return;
					}
					addItem();
				}, 0);
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				this.submit(null);
			}
		});

		renderChips();
	}

	private createPropertyRow(
		parent: HTMLElement,
		field: PropertyFieldState,
		icon?: string,
	): HTMLElement {
		const fieldEl = parent.createDiv({ cls: 'f2-rename-field' });
		const label = fieldEl.createEl('label', {
			cls: 'f2-rename-label f2-rename-prop-label',
			attr: { for: `f2-prop-${field.key}` },
		});
		if (icon) {
			const iconEl = label.createSpan({ cls: 'f2-rename-prop-icon' });
			setIcon(iconEl, icon);
		}
		label.createSpan({ text: field.label });
		return fieldEl;
	}

	private createTextField(
		parent: HTMLElement,
		opts: {
			id: string;
			label: string;
			value: string;
			placeholder?: string;
			suffix?: string;
			editableSuffix?: boolean;
			icon?: string;
			onIconClick?: () => void;
		},
		onInput: (value: string) => void,
	): HTMLInputElement {
		const field = parent.createDiv({ cls: 'f2-rename-field' });
		const label = field.createEl('label', {
			cls: 'f2-rename-label f2-rename-prop-label',
			attr: { for: opts.id },
		});
		if (opts.icon) {
			const iconEl = label.createSpan({
				cls: opts.onIconClick
					? 'f2-rename-prop-icon f2-rename-label-action'
					: 'f2-rename-prop-icon',
				attr: opts.onIconClick
					? {
							role: 'button',
							tabindex: '0',
							title: t('tooltip.clickToOpen'),
							'aria-label': t('aria.openLabeled', {
								label: opts.label,
							}),
						}
					: undefined,
			});
			setIcon(iconEl, opts.icon);
			if (opts.onIconClick) {
				const activate = (evt: Event): void => {
					evt.preventDefault();
					evt.stopPropagation();
					opts.onIconClick?.();
				};
				iconEl.addEventListener('click', activate);
				iconEl.addEventListener('keydown', (evt: KeyboardEvent) => {
					if (evt.key === 'Enter' || evt.key === ' ') {
						activate(evt);
					}
				});
			}
		}
		label.createSpan({ text: opts.label });

		const control = field.createDiv({ cls: 'f2-rename-control' });
		const input = control.createEl('input', {
			type: 'text',
			cls: 'f2-rename-input',
			attr: {
				id: opts.id,
				spellcheck: 'false',
				autocomplete: 'off',
				'aria-label': opts.label,
				...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
			},
		});
		input.value = opts.value;
		input.addEventListener('input', () => onInput(input.value));
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.submitResult();
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				this.submit(null);
			}
		});

		if (opts.suffix) {
			const extEl = control.createSpan({
				text: opts.suffix,
				cls: opts.editableSuffix
					? 'f2-rename-ext is-editable'
					: 'f2-rename-ext',
				attr: opts.editableSuffix
					? {
							title: t('tooltip.doubleClickEditExtension'),
							'aria-label': t('tooltip.doubleClickEditExtension'),
						}
					: undefined,
			});
			if (opts.editableSuffix) {
				this.bindEditableExtension(extEl);
			}
		}

		this.attachWikiLinkSuggest(input, onInput);
		return input;
	}

	private bindEditableExtension(extEl: HTMLElement): void {
		extEl.addEventListener('dblclick', (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			if (extEl.hasClass('is-editing')) return;

			extEl.addClass('is-editing');
			const previous = this.extensionValue || extEl.getText();
			extEl.setAttr('contenteditable', 'true');
			extEl.setAttr('spellcheck', 'false');
			extEl.setText(previous);

			const selection = window.getSelection();
			if (selection) {
				const range = activeDocument.createRange();
				range.selectNodeContents(extEl);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			extEl.focus();

			let finished = false;
			const onKeyDown = (keyEvt: KeyboardEvent): void => {
				if (keyEvt.key === 'Enter') {
					keyEvt.preventDefault();
					keyEvt.stopPropagation();
					finish(true);
				} else if (keyEvt.key === 'Escape') {
					keyEvt.preventDefault();
					keyEvt.stopPropagation();
					finish(false);
				}
			};
			const onBlur = (): void => {
				window.setTimeout(() => finish(true), 0);
			};

			const finish = (commit: boolean): void => {
				if (finished) return;
				finished = true;
				extEl.removeEventListener('keydown', onKeyDown);
				extEl.removeEventListener('blur', onBlur);
				extEl.removeAttribute('contenteditable');
				extEl.removeClass('is-editing');
				if (commit) {
					this.extensionValue = normalizeExtensionSuffix(
						extEl.getText(),
					);
				}
				extEl.setText(this.extensionValue || previous);
			};

			extEl.addEventListener('keydown', onKeyDown);
			extEl.addEventListener('blur', onBlur);
		});
	}

	private getSuggestSourcePath(): string {
		return (
			this.options.sourcePath ??
			this.options.relatedFile?.path ??
			this.app.workspace.getActiveFile()?.path ??
			''
		);
	}

	private attachWikiLinkSuggest(
		inputEl: HTMLInputElement | HTMLTextAreaElement,
		onInserted?: (value: string) => void,
	): void {
		new WikiLinkSuggest(this.app, inputEl, {
			sourcePath: this.getSuggestSourcePath(),
			onInserted,
		});
	}

	private bindEscape(input: HTMLInputElement): void {
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.submit(null);
			}
		});
	}

	private cloneValue(value: PropertyValue): PropertyValue {
		if (Array.isArray(value)) return [...value];
		return value;
	}

	private schedulePersistProperties(): void {
		if (!this.options.autoSaveProperties || !this.options.onPropertiesChange) {
			return;
		}
		if (this.propertySaveTimer !== null) {
			window.clearTimeout(this.propertySaveTimer);
		}
		this.propertySaveTimer = window.setTimeout(() => {
			this.propertySaveTimer = null;
			void this.persistProperties(false);
		}, 320);
	}

	private async persistProperties(flushTimer: boolean): Promise<void> {
		if (!this.options.autoSaveProperties || !this.options.onPropertiesChange) {
			return;
		}
		if (flushTimer && this.propertySaveTimer !== null) {
			window.clearTimeout(this.propertySaveTimer);
			this.propertySaveTimer = null;
		}
		await this.options.onPropertiesChange({ ...this.propertyValues });
	}

	private submitResult(): void {
		const result: RenamePromptResult = { name: this.value };
		if (this.options.showAlias || this.options.mode === 'url') {
			result.alias = this.aliasValue;
		}
		if (this.options.mode !== 'url') {
			const ext =
				this.extensionValue || this.options.extension || '';
			if (ext) {
				result.extension = normalizeExtensionSuffix(ext);
			}
		}
		if (this.fullPropertiesPanel) {
			const snapshot = this.fullPropertiesPanel.getSnapshot();
			result.properties = snapshot.values;
			result.fullPropertyFields = snapshot.fields;
			if (this.options.autoSaveProperties) {
				void this.fullPropertiesPanel.flush();
			}
		} else if ((this.options.properties?.length ?? 0) > 0) {
			result.properties = { ...this.propertyValues };
			if (this.options.autoSaveProperties) {
				void this.persistProperties(true);
			}
		}
		this.submit(result);
	}

	private submit(value: RenamePromptResult | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.close();
		this.onSubmit(value);
	}
}

export function promptRename(
	app: App,
	title: string,
	defaultValue: string,
	options: RenamePromptOptions = {},
): Promise<RenamePromptResult | null> {
	return new Promise((resolve) => {
		new RenamePromptModal(
			app,
			title,
			defaultValue,
			resolve,
			options,
		).open();
	});
}

function normalizeExtensionSuffix(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';
	const cleaned = trimmed.replace(/^\.+/, '.');
	if (cleaned === '.') return '';
	return cleaned.startsWith('.') ? cleaned : `.${cleaned}`;
}
