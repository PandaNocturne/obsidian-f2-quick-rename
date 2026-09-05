import { App, Menu, Notice, setIcon } from 'obsidian';
import { t } from '../i18n';
import {
	PROPERTY_TYPE_OPTIONS,
	propertyTypeLabel,
	type PropertyFieldState,
	type PropertyFieldType,
	type PropertyValue,
} from '../settings';
import {
	estimateMultilineRows,
	isMultilineTextValue,
	readPropertyValue,
} from '../utils/properties';
import {
	appendClassifiedChipPrefix,
	classifyValue,
} from '../utils/value-links';
import {
	ListValueSuggest,
	PropertyKeySuggest,
	TagInputSuggest,
	normalizeTagName,
	resolvePropertyTypeAttr,
	shouldSuggestTags,
} from './tag-suggest';
import { WikiLinkSuggest } from './wiki-link-suggest';

const DRAG_MIME = 'application/x-f2-full-property';

export interface FullPropertiesPanelOptions {
	app: App;
	fields: PropertyFieldState[];
	sourcePath?: string;
	autoSave?: boolean;
	onChange: (
		fields: PropertyFieldState[],
		values: Record<string, PropertyValue>,
	) => void | Promise<void>;
}

/**
 * Obsidian-like full YAML properties editor: add / edit / delete / drag-reorder.
 */
export class FullPropertiesPanel {
	private readonly app: App;
	private readonly sourcePath: string;
	private readonly autoSave: boolean;
	private readonly onChange: FullPropertiesPanelOptions['onChange'];
	private fields: PropertyFieldState[];
	private values: Record<string, PropertyValue> = {};
	private listEl: HTMLElement | null = null;
	private saveTimer: number | null = null;
	private dragFrom = -1;

	constructor(options: FullPropertiesPanelOptions) {
		this.app = options.app;
		this.sourcePath = options.sourcePath ?? '';
		this.autoSave = options.autoSave !== false;
		this.onChange = options.onChange;
		this.fields = options.fields.map((field) => ({
			...field,
			value: Array.isArray(field.value)
				? [...field.value]
				: field.value,
		}));
		for (const field of this.fields) {
			this.values[field.key] = Array.isArray(field.value)
				? [...field.value]
				: field.value;
		}
	}

	mount(parent: HTMLElement): void {
		parent.empty();
		parent.addClass('f2-full-props');

		this.listEl = parent.createDiv({ cls: 'f2-full-props-list' });
		this.renderList();
	}

	/** Add a new empty property row and focus its key field. */
	addProperty(): void {
		const key = this.nextEmptyKey();
		this.fields.push({
			key,
			type: 'text',
			label: key,
			showHint: false,
			multiline: false,
			value: '',
		});
		this.values[key] = '';
		this.renderList();
		const keyInputs = this.listEl?.querySelectorAll('.f2-full-props-key');
		const last = keyInputs?.[keyInputs.length - 1] as
			| HTMLInputElement
			| undefined;
		last?.focus();
		last?.select();
		// Empty key row is ephemeral until named; don't wipe frontmatter yet.
	}

	destroy(): void {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.listEl = null;
	}

	getSnapshot(): {
		fields: PropertyFieldState[];
		values: Record<string, PropertyValue>;
	} {
		return {
			fields: this.fields.map((field) => ({
				...field,
				value: this.cloneValue(
					this.values[field.key] ?? field.value,
				),
			})),
			values: { ...this.values },
		};
	}

	async flush(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.onChange(this.fields, { ...this.values });
	}

	private renderList(): void {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		this.fields.forEach((field, index) => {
			this.renderRow(listEl, field, index);
		});
	}

	private renderRow(
		parent: HTMLElement,
		field: PropertyFieldState,
		index: number,
	): void {
		const row = parent.createDiv({
			cls: 'f2-full-props-row',
			attr: { 'data-index': String(index) },
		});

		const handle = row.createSpan({
			cls: 'f2-full-props-handle',
			attr: {
				draggable: 'true',
				'aria-label': t('common.dragToReorder'),
			},
		});
		setIcon(handle, 'grip-vertical');

		const typeBtn = row.createEl('button', {
			cls: 'f2-full-props-type',
			attr: {
				type: 'button',
				'aria-label': t('properties.changeType'),
			},
		});
		const typeMeta = PROPERTY_TYPE_OPTIONS.find(
			(item) => item.type === field.type,
		);
		setIcon(typeBtn, typeMeta?.icon ?? 'align-left');
		typeBtn.addEventListener('click', (evt) => {
			evt.preventDefault();
			this.openTypeMenu(typeBtn, index);
		});

		const keyInput = row.createEl('input', {
			cls: 'f2-full-props-key',
			attr: {
				type: 'text',
				spellcheck: 'false',
				autocomplete: 'off',
				placeholder: t('properties.keyPlaceholder'),
				'aria-label': t('properties.keyPlaceholder'),
			},
		});
		keyInput.value = field.key;
		new PropertyKeySuggest(this.app, keyInput, (key) => {
			this.renameKey(index, key);
			const inferred = this.inferTypeForKey(key, this.values[key]);
			if (inferred !== this.fields[index]?.type) {
				this.setType(index, inferred);
			}
		});
		keyInput.addEventListener('change', () => {
			this.renameKey(index, keyInput.value);
		});
		keyInput.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				keyInput.blur();
			}
		});

		const valueHost = row.createDiv({ cls: 'f2-full-props-value' });
		this.renderValueEditor(valueHost, field, index);

		const removeBtn = row.createEl('button', {
			cls: 'f2-full-props-remove',
			attr: {
				type: 'button',
				'aria-label': t('properties.deleteProperty'),
			},
		});
		setIcon(removeBtn, 'x');
		removeBtn.addEventListener('click', () => this.removeAt(index));

		// Only the grip handle starts a drag so inputs keep text selection.
		handle.addEventListener('dragstart', (evt) => {
			this.dragFrom = index;
			row.addClass('is-dragging');
			evt.dataTransfer?.setData(DRAG_MIME, String(index));
			if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'move';
		});
		handle.addEventListener('dragend', () => {
			this.dragFrom = -1;
			row.removeClass('is-dragging');
			parent
				.querySelectorAll('.f2-full-props-row.is-drop-target')
				.forEach((el) => el.removeClass('is-drop-target'));
		});
		row.addEventListener('dragover', (evt) => {
			evt.preventDefault();
			if (this.dragFrom < 0 || this.dragFrom === index) return;
			row.addClass('is-drop-target');
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
		});
		row.addEventListener('dragleave', () => {
			row.removeClass('is-drop-target');
		});
		row.addEventListener('drop', (evt) => {
			evt.preventDefault();
			row.removeClass('is-drop-target');
			const from = this.dragFrom;
			if (from < 0 || from === index) return;
			this.moveField(from, index);
		});
	}

	private renderValueEditor(
		host: HTMLElement,
		field: PropertyFieldState,
		index: number,
	): void {
		host.empty();
		const key = field.key;

		switch (field.type) {
			case 'checkbox': {
				const input = host.createEl('input', {
					type: 'checkbox',
					cls: 'f2-full-props-checkbox',
				});
				input.checked = Boolean(this.values[key]);
				input.addEventListener('change', () => {
					this.setValue(key, input.checked, true);
				});
				break;
			}
			case 'number': {
				const input = host.createEl('input', {
					type: 'number',
					cls: 'f2-full-props-input',
					attr: { spellcheck: 'false' },
				});
				const current = this.values[key];
				input.value =
					current === null || current === undefined
						? ''
						: String(current);
				input.addEventListener('input', () => {
					const raw = input.value.trim();
					this.setValue(key, raw === '' ? null : Number(raw), false);
				});
				input.addEventListener('change', () => {
					void this.persist(true);
				});
				break;
			}
			case 'date':
			case 'datetime': {
				const input = host.createEl('input', {
					type: field.type === 'date' ? 'date' : 'datetime-local',
					cls: 'f2-full-props-input',
				});
				let display =
					this.values[key] == null ? '' : String(this.values[key]);
				if (field.type === 'datetime' && display) {
					display = display.replace(' ', 'T').slice(0, 16);
				}
				input.value = display;
				input.addEventListener('input', () => {
					this.setValue(key, input.value, false);
				});
				input.addEventListener('change', () => {
					void this.persist(true);
				});
				break;
			}
			case 'list':
				this.renderListEditor(host, field);
				break;
			case 'select':
				this.renderSelectEditor(host, field);
				break;
			case 'text':
			default: {
				const text =
					this.values[key] == null ? '' : String(this.values[key]);
				const useMultiline =
					field.multiline || isMultilineTextValue(text);
				if (useMultiline) {
					this.renderMultilineText(host, field, key, text);
				} else {
					this.renderSingleLineText(host, field, key, text, index);
				}
				break;
			}
		}
	}

	private renderMultilineText(
		host: HTMLElement,
		field: PropertyFieldState,
		key: string,
		text: string,
	): void {
		field.multiline = true;
		const textarea = host.createEl('textarea', {
			cls: 'f2-full-props-input f2-full-props-textarea',
			attr: {
				rows: String(estimateMultilineRows(text)),
				spellcheck: 'false',
				placeholder: t('properties.noValuePlaceholder'),
				wrap: 'soft',
			},
		});
		textarea.value = text;
		const syncRows = (): void => {
			textarea.rows = estimateMultilineRows(textarea.value);
		};
		textarea.addEventListener('input', () => {
			field.multiline = isMultilineTextValue(textarea.value);
			this.setValue(key, textarea.value, false);
			syncRows();
			// Shrink back to single-line when content becomes short again.
			if (!field.multiline) {
				const index = this.fields.findIndex((item) => item.key === key);
				if (index >= 0) {
					this.renderValueEditor(host, field, index);
					const input = host.querySelector('input');
					input?.focus();
					input?.setSelectionRange(
						textarea.value.length,
						textarea.value.length,
					);
				}
			}
		});
		textarea.addEventListener('change', () => {
			void this.persist(true);
		});
		this.attachWikiLinkSuggest(textarea, key);
	}

	private renderSingleLineText(
		host: HTMLElement,
		field: PropertyFieldState,
		key: string,
		text: string,
		index: number,
	): void {
		const input = host.createEl('input', {
			type: 'text',
			cls: 'f2-full-props-input',
			attr: {
				spellcheck: 'false',
				autocomplete: 'off',
				placeholder: t('properties.noValuePlaceholder'),
			},
		});
		input.value = text;
		input.addEventListener('input', () => {
			const next = input.value;
			if (isMultilineTextValue(next)) {
				field.multiline = true;
				this.values[key] = next;
				field.value = next;
				this.renderValueEditor(host, field, index);
				const textarea = host.querySelector('textarea');
				textarea?.focus();
				textarea?.setSelectionRange(next.length, next.length);
				this.schedulePersist();
				return;
			}
			this.setValue(key, next, false);
		});
		input.addEventListener('change', () => {
			void this.persist(true);
		});
		input.addEventListener('paste', () => {
			window.setTimeout(() => {
				if (!isMultilineTextValue(input.value)) return;
				field.multiline = true;
				this.values[key] = input.value;
				field.value = input.value;
				this.renderValueEditor(host, field, index);
				const textarea = host.querySelector('textarea');
				textarea?.focus();
				this.schedulePersist();
			}, 0);
		});
		this.attachWikiLinkSuggest(input, key);
	}

	private attachWikiLinkSuggest(
		inputEl: HTMLInputElement | HTMLTextAreaElement,
		key: string,
	): void {
		new WikiLinkSuggest(this.app, inputEl, {
			sourcePath: this.sourcePath,
			onInserted: (value) => {
				this.setValue(key, value, false);
			},
		});
	}

	private renderSelectEditor(
		host: HTMLElement,
		field: PropertyFieldState,
	): void {
		const key = field.key;
		const input = host.createEl('input', {
			type: 'text',
			cls: 'f2-full-props-input f2-full-props-select-input',
			attr: {
				spellcheck: 'false',
				autocomplete: 'off',
				placeholder: t('properties.noValuePlaceholder'),
			},
		});
		const current = this.values[key];
		input.value = current == null ? '' : String(current);
		input.addEventListener('input', () => {
			this.setValue(key, input.value, false);
		});
		input.addEventListener('change', () => {
			void this.persist(true);
		});

		if (field.showHint) {
			new ListValueSuggest(
				this.app,
				input,
				key,
				() => [],
				(value) => {
					input.value = value;
					this.setValue(key, value, true);
				},
				this.sourcePath,
				false,
			);
		} else {
			this.attachWikiLinkSuggest(input, key);
		}
	}

	private renderListEditor(
		host: HTMLElement,
		field: PropertyFieldState,
	): void {
		const propertyType = resolvePropertyTypeAttr(field.key, field.type);
		const isTags = propertyType === 'tags';
		const useTagSuggest = isTags || shouldSuggestTags(field.key);

		const wrap = host.createDiv({
			cls: 'f2-full-props-list-editor',
			attr: {
				'data-property-type': propertyType,
				'data-property-key': field.key,
			},
		});
		const input = wrap.createEl('input', {
			type: 'text',
			cls: 'f2-full-props-input',
			attr: {
				spellcheck: 'false',
				autocomplete: 'off',
				placeholder: t('properties.listAddPlaceholder'),
				'data-property-type': field.key,
			},
		});
		const chips = wrap.createDiv({
			cls: 'f2-full-props-chips',
			attr: { 'data-property-type': field.key },
		});

		const getList = (): string[] => {
			const value = this.values[field.key];
			return Array.isArray(value) ? [...value] : [];
		};

		const setList = (next: string[]): void => {
			this.values[field.key] = next;
			renderChips();
			void this.persist(true);
		};

		const renderChips = (): void => {
			chips.empty();
			const sourcePath = this.sourcePath;
			for (const [chipIndex, item] of getList().entries()) {
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
						'aria-label':
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

				const remove = chip.createEl('button', {
					cls: 'f2-rename-chip-remove',
					attr: { type: 'button', 'aria-label': t('common.remove') },
				});
				setIcon(remove, 'x');
				remove.addEventListener('click', (evt) => {
					evt.stopPropagation();
					const list = getList();
					list.splice(chipIndex, 1);
					setList(list);
				});
				remove.addEventListener('dblclick', (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
				});

				const beginEdit = (): void => {
					if (chip.hasClass('is-editing')) return;
					chip.addClass('is-editing');
					chip.removeAttribute('aria-label');
					remove.hide();
					prefix.hide();

					textEl.setAttr('contenteditable', 'true');
					textEl.setAttr('spellcheck', 'false');
					textEl.setAttr('role', 'textbox');
					textEl.setText(classified.display);

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
								list.splice(chipIndex, 1);
								setList(list);
								return;
							}
							const duplicate = list.some(
								(other, i) =>
									i !== chipIndex &&
									other.toLowerCase() === next.toLowerCase(),
							);
							if (duplicate) {
								closed = false;
								new Notice(t('notice.duplicateListItem'));
								textEl.focus();
								return;
							}
							list[chipIndex] = next;
							setList(list);
						});
					};

					const cancel = (): void => {
						finish(() => renderChips());
					};

					textEl.addEventListener('keydown', (evt: KeyboardEvent) => {
						if (evt.key === 'Enter') {
							evt.preventDefault();
							evt.stopPropagation();
							commit();
						} else if (evt.key === 'Escape') {
							evt.preventDefault();
							evt.stopPropagation();
							cancel();
						}
					});
					textEl.addEventListener('blur', () => {
						window.setTimeout(() => commit(), 0);
					});

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
			}
		};

		const addItem = (raw: string): void => {
			const text = useTagSuggest
				? normalizeTagName(raw)
				: raw.trim();
			if (!text) return;
			const list = getList();
			if (
				list.some(
					(item) => item.toLowerCase() === text.toLowerCase(),
				)
			) {
				input.value = '';
				return;
			}
			list.push(text);
			setList(list);
			input.value = '';
		};

		if (field.showHint || useTagSuggest) {
			if (useTagSuggest) {
				new TagInputSuggest(
					this.app,
					input,
					() => getList(),
					(tag) => addItem(tag),
					this.sourcePath,
				);
			} else {
				new ListValueSuggest(
					this.app,
					input,
					field.key,
					() => getList(),
					(value) => addItem(value),
					this.sourcePath,
				);
			}
		}

		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				addItem(input.value);
			}
		});

		renderChips();
	}

	private openTypeMenu(anchor: HTMLElement, index: number): void {
		const field = this.fields[index];
		if (!field) return;
		const menu = new Menu();
		for (const option of PROPERTY_TYPE_OPTIONS) {
			menu.addItem((item) => {
				item.setTitle(propertyTypeLabel(option.type))
					.setIcon(option.icon)
					.setChecked(option.type === field.type)
					.onClick(() => this.setType(index, option.type));
			});
		}
		const rect = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
	}

	private nextEmptyKey(): string {
		let i = 1;
		let key = '';
		while (this.fields.some((field) => field.key === key)) {
			key = `property-${i++}`;
		}
		// Prefer blank key like Obsidian's new row; use placeholder unique id if blank exists.
		if (!this.fields.some((field) => field.key === '')) return '';
		return key;
	}

	private removeAt(index: number): void {
		const [removed] = this.fields.splice(index, 1);
		if (removed) {
			delete this.values[removed.key];
		}
		this.renderList();
		void this.persist(true);
	}

	private moveField(from: number, to: number): void {
		if (
			from < 0 ||
			to < 0 ||
			from >= this.fields.length ||
			to >= this.fields.length
		) {
			return;
		}
		const [item] = this.fields.splice(from, 1);
		if (!item) return;
		this.fields.splice(to, 0, item);
		this.renderList();
		void this.persist(true);
	}

	private renameKey(index: number, nextRaw: string): void {
		const field = this.fields[index];
		if (!field) return;
		const next = nextRaw.trim();
		const prev = field.key;
		if (next === prev) return;

		if (
			next &&
			this.fields.some(
				(item, i) => i !== index && item.key.toLowerCase() === next.toLowerCase(),
			)
		) {
			// Keep previous key in the input on duplicate.
			this.renderList();
			return;
		}

		const value = this.values[prev];
		delete this.values[prev];
		field.key = next;
		field.label = next || field.label;
		if (next) {
			this.values[next] = value ?? '';
		}
		this.renderList();
		void this.persist(true);
	}

	private setType(index: number, type: PropertyFieldType): void {
		const field = this.fields[index];
		if (!field || field.type === type) return;
		const key = field.key;
		const raw = this.values[key];
		field.type = type;
		const next = readPropertyValue(raw, type);
		field.value = next;
		this.values[key] = next;
		field.showHint = type === 'list' || type === 'select';
		field.multiline = type === 'text' && isMultilineTextValue(next);
		this.renderList();
		void this.persist(true);
	}

	private inferTypeForKey(key: string, value: unknown): PropertyFieldType {
		const lower = key.trim().toLowerCase();
		if (lower === 'tags' || lower === 'tag' || lower === 'aliases') {
			return 'list';
		}
		if (typeof value === 'boolean') return 'checkbox';
		if (typeof value === 'number') return 'number';
		if (Array.isArray(value)) return 'list';
		return 'text';
	}

	private setValue(
		key: string,
		value: PropertyValue,
		immediate: boolean,
	): void {
		this.values[key] = value;
		const field = this.fields.find((item) => item.key === key);
		if (field) field.value = value;
		if (immediate) {
			void this.persist(true);
		} else {
			this.schedulePersist();
		}
	}

	private schedulePersist(): void {
		if (!this.autoSave) return;
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.persist(false);
		}, 320);
	}

	private async persist(flushTimer: boolean): Promise<void> {
		if (!this.autoSave) return;
		if (flushTimer && this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		// Drop ephemeral blank-key rows from the write payload.
		const fields = this.fields.filter((field) => field.key.trim());
		const values: Record<string, PropertyValue> = {};
		for (const field of fields) {
			const value = this.values[field.key];
			values[field.key] =
				value !== undefined ? value : field.value;
		}
		await this.onChange(fields, values);
	}

	private cloneValue(value: PropertyValue): PropertyValue {
		if (Array.isArray(value)) return [...value];
		return value;
	}
}
