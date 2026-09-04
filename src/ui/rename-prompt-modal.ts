import { App, Modal, Notice, setIcon } from 'obsidian';
import type {
	PropertyFieldState,
	PropertyPanelItem,
	PropertyValue,
} from '../settings';
import { PROPERTY_TYPE_OPTIONS } from '../settings';
import {
	ListValueSuggest,
	TagInputSuggest,
	normalizeTagName,
	resolvePropertyTypeAttr,
	shouldSuggestTags,
} from './tag-suggest';

export interface RenamePromptResult {
	name: string;
	/** Present when the alias/title field was shown. */
	alias?: string;
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
		this.onSubmit = onSubmit;

		for (const item of options.properties ?? []) {
			if (item.kind !== 'field') continue;
			this.propertyValues[item.field.key] = this.cloneValue(
				item.field.value,
			);
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

		const nameField = {
			id: 'f2-rename-input',
			label: this.options.nameLabel ?? (isUrl ? 'URL' : '文件名'),
			value: this.defaultValue,
			suffix: isUrl ? undefined : this.options.extension,
			placeholder: isUrl ? 'https://…' : undefined,
		};

		const aliasField = showAlias
			? {
					id: 'f2-rename-alias-input',
					label: this.options.aliasLabel ?? (isUrl ? '标题' : '别名'),
					value: this.aliasValue,
					placeholder: isUrl
						? '链接显示标题'
						: '可选，对应 | 后的显示名',
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
		const cancelBtn = footer.createEl('button', {
			text: '取消',
			cls: 'f2-rename-btn',
		});
		cancelBtn.addEventListener('click', () => this.submit(null));

		const confirmBtn = footer.createEl('button', {
			text: isUrl ? '保存' : '重命名',
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta',
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
				this.renderInputProperty(
					parent,
					field,
					'text',
					typeMeta?.icon,
				);
				break;
		}
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
			for (const [index, item] of getList().entries()) {
				const chip = chips.createSpan({
					cls: 'f2-rename-chip',
					attr: {
						title: '双击编辑',
						...(isTags ? { 'data-property-type': 'tags' } : {}),
					},
				});
				const textEl = chip.createSpan({
					cls: 'f2-rename-chip-text',
				});
				textEl.setText(
					useTagSuggest ? `#${normalizeTagName(item)}` : item,
				);

				const beginEdit = (): void => {
					if (chip.hasClass('is-editing')) return;
					chip.addClass('is-editing');
					chip.removeAttribute('title');
					remove.hide();

					textEl.setAttr('contenteditable', 'true');
					textEl.setAttr('spellcheck', 'false');
					textEl.setAttr('role', 'textbox');
					textEl.setText(
						useTagSuggest ? `#${normalizeTagName(item)}` : item,
					);

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
			if (useTagSuggest) {
				new TagInputSuggest(
					this.app,
					input,
					() => getList(),
					(tag) => {
						suggestPicked = true;
						addItemValue(tag);
					},
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
				);
			}
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
		},
		onInput: (value: string) => void,
	): HTMLInputElement {
		const field = parent.createDiv({ cls: 'f2-rename-field' });
		field.createEl('label', {
			text: opts.label,
			cls: 'f2-rename-label',
			attr: { for: opts.id },
		});

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
			control.createSpan({
				text: opts.suffix,
				cls: 'f2-rename-ext',
			});
		}

		return input;
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
