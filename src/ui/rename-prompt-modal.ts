import { App, Modal, Notice, TFile, normalizePath, setIcon } from 'obsidian';
import type {
	PropertyFieldState,
	PropertyPanelItem,
	PropertyValue,
} from '../settings';
import { PROPERTY_TYPE_OPTIONS } from '../settings';
import {
	classifyValue,
	openClassifiedValue,
	openRelatedFile,
	type ClassifiedValue,
} from '../utils/value-links';
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
	nameLabel?: string;
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
	/** Related vault file for “关联文档” (click label icon to open). */
	relatedFile?: TFile | null;
	/** Document properties / separators shown under the collapsible “更多” section. */
	properties?: PropertyPanelItem[];
	/** Persist property edits immediately (default driven by settings). */
	autoSaveProperties?: boolean;
	/** Called when properties change and auto-save is enabled. */
	onPropertiesChange?: (
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
		setIcon(iconWrap, this.options.mode === 'url' ? 'link' : 'pencil');
		header.createEl('h2', {
			text: this.titleText,
			cls: 'f2-rename-title',
		});

		const body = contentEl.createDiv({ cls: 'f2-rename-body' });
		const form = body.createDiv({ cls: 'f2-rename-form' });

		const isUrl = this.options.mode === 'url';
		const showAlias = this.options.showAlias ?? isUrl;
		const relatedFile = this.options.relatedFile ?? null;
		const isRelatedDoc = Boolean(relatedFile) && !isUrl;

		const nameField = {
			id: 'f2-rename-input',
			label:
				this.options.nameLabel ??
				(isUrl ? '链接' : isRelatedDoc ? '关联文档' : '文件名'),
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
							new Notice('URL 为空');
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
						this.options.aliasLabel ?? (isUrl ? '标题' : '别名'),
					value: this.aliasValue,
					placeholder: isUrl
						? '链接显示标题'
						: '可选，对应 | 后的显示名',
					icon: isUrl ? 'heading' : 'quote',
					onIconClick: isUrl
						? () => {
								const url = this.value.trim();
								if (!url) {
									new Notice('URL 为空');
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
		if (properties.length > 0) {
			this.renderMoreSection(body, properties);
		}

		const footer = contentEl.createDiv({ cls: 'f2-rename-footer' });
		const left = footer.createDiv({ cls: 'f2-rename-footer-left' });
		const right = footer.createDiv({ cls: 'f2-rename-footer-right' });

		const copyPathBtn = left.createEl('button', {
			text: '复制路径',
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		copyPathBtn.addEventListener('click', () => {
			void this.copyText(this.getCopyPath(), '路径');
		});

		const copyTitleBtn = left.createEl('button', {
			text: '复制标题',
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		copyTitleBtn.addEventListener('click', () => {
			void this.copyText(this.getCopyTitle(), '标题');
		});

		const cancelBtn = right.createEl('button', {
			text: '取消',
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		cancelBtn.addEventListener('click', () => this.submit(null));

		const confirmBtn = right.createEl('button', {
			text: '确认',
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta',
			attr: { type: 'button' },
		});
		confirmBtn.addEventListener('click', () => this.submitResult());

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
		if (this.options.autoSaveProperties) {
			void this.persistProperties(true);
		} else if (this.propertySaveTimer !== null) {
			window.clearTimeout(this.propertySaveTimer);
			this.propertySaveTimer = null;
		}
		const { contentEl } = this;
		contentEl.empty();
		this.inputEl = null;
		this.aliasInputEl = null;
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
	}

	private renderMoreSection(
		parent: HTMLElement,
		properties: PropertyPanelItem[],
	): void {
		const details = parent.createEl('details', {
			cls: 'f2-rename-more',
		});
		const summary = details.createEl('summary', {
			cls: 'f2-rename-more-summary',
		});
		const summaryIcon = summary.createSpan({
			cls: 'f2-rename-more-chevron',
		});
		setIcon(summaryIcon, 'chevron-right');
		summary.createSpan({ text: '更多' });

		const panel = details.createDiv({ cls: 'f2-rename-more-body' });
		const form = panel.createDiv({ cls: 'f2-rename-form' });

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
				...(field.showHint
					? { placeholder: field.label }
					: {}),
				...(isTags ? { 'data-property-type': 'tags' } : {}),
			},
		});

		const chips = wrap.createDiv({
			cls: 'f2-rename-list-chips',
			attr: isTags ? { 'data-property-type': 'tags' } : undefined,
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
								? '双击编辑'
								: '点击图标打开，双击编辑',
						...(isTags ? { 'data-property-type': 'tags' } : {}),
						'data-value-kind': classified.kind,
					},
				});

				const prefix = chip.createSpan({
					cls:
						classified.kind === 'text'
							? 'f2-rename-chip-prefix'
							: 'f2-rename-chip-prefix is-action',
					attr:
						classified.kind === 'text'
							? undefined
							: {
									role: 'button',
									tabindex: '0',
									title: chipActionTitle(classified),
									'aria-label': chipActionTitle(classified),
								},
				});
				setIcon(prefix, classified.icon);
				if (classified.kind !== 'text') {
					const openValue = (evt: Event): void => {
						evt.preventDefault();
						evt.stopPropagation();
						void openClassifiedValue(
							this.app,
							classified,
							sourcePath,
						);
					};
					prefix.addEventListener('click', openValue);
					prefix.addEventListener('keydown', (evt: KeyboardEvent) => {
						if (evt.key === 'Enter' || evt.key === ' ') {
							openValue(evt);
						}
					});
					prefix.addEventListener('dblclick', (evt) => {
						evt.preventDefault();
						evt.stopPropagation();
					});
				}

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
								new Notice('列表中已存在相同项');
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
					attr: { type: 'button', 'aria-label': '移除' },
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
							title: '点击打开',
							'aria-label': `打开${opts.label}`,
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
							title: '双击修改扩展名',
							'aria-label': '双击修改扩展名',
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

	private getCopyPath(): string {
		if (this.options.mode === 'url') {
			return this.value.trim();
		}

		const name = this.value.trim();
		const ext = this.extensionValue || this.options.extension || '';
		const file = this.options.relatedFile;
		if (file) {
			const parent = file.parent?.path ?? '';
			const leaf = `${name || file.basename}${ext}`;
			return normalizePath(parent ? `${parent}/${leaf}` : leaf);
		}

		if (name) {
			return `${name}${ext}`;
		}
		return this.options.sourcePath?.trim() ?? '';
	}

	private getCopyTitle(): string {
		if (this.options.mode === 'url') {
			return this.aliasValue.trim() || this.value.trim();
		}

		const titleProp = this.propertyValues.title;
		if (typeof titleProp === 'string' && titleProp.trim()) {
			return titleProp.trim();
		}
		if (this.aliasValue.trim()) {
			return this.aliasValue.trim();
		}
		return this.value.trim();
	}

	private async copyText(text: string, label: string): Promise<void> {
		const value = text.trim();
		if (!value) {
			new Notice(`${label}为空，无法复制`);
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			new Notice(`已复制${label}`);
		} catch {
			new Notice(`复制${label}失败`);
		}
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
		if ((this.options.properties?.length ?? 0) > 0) {
			result.properties = { ...this.propertyValues };
			// Flush any pending debounced auto-save before closing.
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

function chipActionTitle(value: ClassifiedValue): string {
	switch (value.kind) {
		case 'tag':
			return '打开标签搜索';
		case 'url':
			return '打开链接';
		case 'document':
			return '打开关联文档';
		default:
			return '';
	}
}

/** Ensure extension starts with a dot when non-empty. */
function normalizeExtensionSuffix(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';
	const cleaned = trimmed.replace(/^\.+/, '.');
	if (cleaned === '.') return '';
	return cleaned.startsWith('.') ? cleaned : `.${cleaned}`;
}
