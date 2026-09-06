import { App, Modal, PluginSettingTab, Setting, setIcon } from 'obsidian';
import { t, type LocalePreference, type TranslationKey } from '../i18n';
import type F2RenamePlugin from '../main';
import {
	DEFAULT_PROPERTY_FIELDS,
	PROPERTY_TYPE_OPTIONS,
	clonePropertySettingsItem,
	isPropertyField,
	isPropertyRow,
	propertyTypeLabel,
	propertyTypeSupportsHint,
	type F2RenameSettings,
	type PropertyFieldConfig,
	type PropertyFieldType,
	type PropertyRowConfig,
	type PropertySettingsItem,
} from '../settings';
import {
	DEFAULT_ATTACHMENT_EXTENSIONS,
	DEFAULT_ATTACHMENT_NAME_TEMPLATE,
	DEFAULT_ATTACHMENT_RENAME_DELAY_MS,
} from '../utils/attachments';
import {
	DEFAULT_MODAL_MAX_HEIGHT,
	DEFAULT_MODAL_WIDTH,
	normalizeCssLengthList,
} from '../utils/css-size';
import {
	PropertyKeySuggest,
	resolvePropertyFieldType,
} from './tag-suggest';

class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly heading: string,
		private readonly message: string,
		private readonly confirmText: string,
		private readonly onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.heading });
		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText(t('common.cancel')).onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText(this.confirmText)
					.setWarning()
					.onClick(() => {
						this.close();
						void this.onConfirm();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
type ToggleKey = {
	[K in keyof F2RenameSettings]: F2RenameSettings[K] extends boolean
		? K
		: never;
}[keyof F2RenameSettings];

interface ToggleOption {
	key: ToggleKey;
	nameKey: TranslationKey;
	descKey: TranslationKey;
}

/** Drag payload for nested property settings list. */
type DragPath =
	| { scope: 'root'; index: number }
	| { scope: 'row'; rowIndex: number; index: number };

const TOGGLE_OPTIONS: ToggleOption[] = [
	{
		key: 'renameEmbeds',
		nameKey: 'settings.features.renameEmbeds.name',
		descKey: 'settings.features.renameEmbeds.desc',
	},
	{
		key: 'editEmbedAlias',
		nameKey: 'settings.features.editEmbedAlias.name',
		descKey: 'settings.features.editEmbedAlias.desc',
	},
	{
		key: 'renameHeadings',
		nameKey: 'settings.features.renameHeadings.name',
		descKey: 'settings.features.renameHeadings.desc',
	},
	{
		key: 'renameCompanions',
		nameKey: 'settings.features.renameCompanions.name',
		descKey: 'settings.features.renameCompanions.desc',
	},
	{
		key: 'copyNameToClipboard',
		nameKey: 'settings.features.copyNameToClipboard.name',
		descKey: 'settings.features.copyNameToClipboard.desc',
	},
	{
		key: 'editProperties',
		nameKey: 'settings.features.editProperties.name',
		descKey: 'settings.features.editProperties.desc',
	},
	{
		key: 'autoSaveProperties',
		nameKey: 'settings.features.autoSaveProperties.name',
		descKey: 'settings.features.autoSaveProperties.desc',
	},
	{
		key: 'editExtension',
		nameKey: 'settings.features.editExtension.name',
		descKey: 'settings.features.editExtension.desc',
	},
];

const DRAG_MIME = 'application/x-f2-rename-property';

type SettingsTabId = 'general' | 'features' | 'properties' | 'attachments';

const SETTINGS_TABS: { id: SettingsTabId; labelKey: TranslationKey }[] = [
	{ id: 'general', labelKey: 'settings.tab.general' },
	{ id: 'features', labelKey: 'settings.tab.features' },
	{ id: 'properties', labelKey: 'settings.tab.properties' },
	{ id: 'attachments', labelKey: 'settings.tab.attachments' },
];

export class F2RenameSettingTab extends PluginSettingTab {
	plugin: F2RenamePlugin;
	private dragPath: DragPath | null = null;
	private activeTab: SettingsTabId = 'general';

	constructor(app: App, plugin: F2RenamePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.dragPath = null;
		containerEl.addClass('f2-rename-settings');

		const nav = containerEl.createDiv({
			cls: 'f2-rename-settings-tabs',
			attr: { role: 'tablist' },
		});
		const panels = containerEl.createDiv({ cls: 'f2-rename-settings-panels' });

		const panelEls = new Map<SettingsTabId, HTMLElement>();
		const tabButtons = new Map<SettingsTabId, HTMLButtonElement>();

		const showTab = (id: SettingsTabId) => {
			this.activeTab = id;
			for (const tab of SETTINGS_TABS) {
				const panel = panelEls.get(tab.id);
				const btn = tabButtons.get(tab.id);
				const active = tab.id === id;
				panel?.toggleClass('is-active', active);
				btn?.toggleClass('is-active', active);
				btn?.setAttr('aria-selected', active ? 'true' : 'false');
			}
		};

		for (const tab of SETTINGS_TABS) {
			const btn = nav.createEl('button', {
				cls: 'f2-rename-settings-tab',
				text: t(tab.labelKey),
				attr: {
					type: 'button',
					role: 'tab',
					'aria-selected': 'false',
				},
			});
			btn.addEventListener('click', () => showTab(tab.id));
			tabButtons.set(tab.id, btn);

			const panel = panels.createDiv({
				cls: 'f2-rename-settings-panel',
				attr: { role: 'tabpanel' },
			});
			panelEls.set(tab.id, panel);
		}

		const general = panelEls.get('general');
		const features = panelEls.get('features');
		const properties = panelEls.get('properties');
		const attachments = panelEls.get('attachments');
		if (general) this.renderGeneralSettings(general);
		if (features) this.renderFeatureSettings(features);
		if (properties) this.renderPropertyFieldsSection(properties);
		if (attachments) this.renderAttachmentSettings(attachments);

		showTab(this.activeTab);
	}

	private renderGeneralSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t('settings.basic.heading')).setHeading();

		new Setting(containerEl)
			.setName(t('settings.basic.locale.name'))
			.setDesc(t('settings.basic.locale.desc'))
			.addDropdown((dd) =>
				dd
					.addOption('system', t('settings.basic.locale.system'))
					.addOption('zh-CN', t('settings.basic.locale.zhCN'))
					.addOption('en', t('settings.basic.locale.en'))
					.setValue(this.plugin.settings.locale)
					.onChange(async (value) => {
						this.plugin.settings.locale = value as LocalePreference;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		this.addCssSizeSetting(containerEl, {
			nameKey: 'settings.basic.modalWidth.name',
			descKey: 'settings.basic.modalWidth.desc',
			settingKey: 'modalWidth',
			fallback: DEFAULT_MODAL_WIDTH,
		});
		this.addCssSizeSetting(containerEl, {
			nameKey: 'settings.basic.modalMaxHeight.name',
			descKey: 'settings.basic.modalMaxHeight.desc',
			settingKey: 'modalMaxHeight',
			fallback: DEFAULT_MODAL_MAX_HEIGHT,
		});
	}

	private renderFeatureSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(t('settings.features.heading'))
			.setHeading();

		containerEl.createEl('p', {
			text: t('settings.features.intro'),
			cls: 'setting-item-description',
		});

		for (const option of TOGGLE_OPTIONS) {
			new Setting(containerEl)
				.setName(t(option.nameKey))
				.setDesc(t(option.descKey))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[option.key])
						.onChange(async (value) => {
							this.plugin.settings[option.key] = value;
							await this.plugin.saveSettings();
						}),
				);
		}
	}

	private renderAttachmentSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(t('settings.attachments.heading'))
			.setHeading();

		containerEl.createEl('p', {
			text: t('settings.attachments.intro'),
			cls: 'setting-item-description',
		});

		const extensions = new Setting(containerEl)
			.setName(t('settings.attachments.extensions.name'))
			.setDesc(t('settings.attachments.extensions.desc'));
		extensions.addText((text) => {
			text
				.setPlaceholder(DEFAULT_ATTACHMENT_EXTENSIONS)
				.setValue(this.plugin.settings.attachmentExtensions)
				.onChange(async (value) => {
					this.plugin.settings.attachmentExtensions = value;
					await this.plugin.saveSettings();
				});
		});
		extensions.addExtraButton((btn) =>
			btn
				.setIcon('rotate-ccw')
				.setTooltip(t('settings.attachments.reset'))
				.onClick(async () => {
					this.plugin.settings.attachmentExtensions =
						DEFAULT_ATTACHMENT_EXTENSIONS;
					await this.plugin.saveSettings();
					this.display();
				}),
		);

		const template = new Setting(containerEl)
			.setName(t('settings.attachments.template.name'))
			.setDesc(t('settings.attachments.template.desc'));
		template.addText((text) => {
			text
				.setPlaceholder(DEFAULT_ATTACHMENT_NAME_TEMPLATE)
				.setValue(this.plugin.settings.attachmentNameTemplate)
				.onChange(async (value) => {
					this.plugin.settings.attachmentNameTemplate = value;
					await this.plugin.saveSettings();
				});
			text.inputEl.addClass('f2-rename-setting-wide');
		});
		template.addExtraButton((btn) =>
			btn
				.setIcon('rotate-ccw')
				.setTooltip(t('settings.attachments.reset'))
				.onClick(async () => {
					this.plugin.settings.attachmentNameTemplate =
						DEFAULT_ATTACHMENT_NAME_TEMPLATE;
					await this.plugin.saveSettings();
					this.display();
				}),
		);

		const delay = new Setting(containerEl)
			.setName(t('settings.attachments.delay.name'))
			.setDesc(t('settings.attachments.delay.desc'));
		delay.addText((text) => {
			text
				.setPlaceholder(String(DEFAULT_ATTACHMENT_RENAME_DELAY_MS))
				.setValue(String(this.plugin.settings.attachmentRenameDelayMs))
				.onChange(async (value) => {
					const parsed = Number.parseInt(value.trim(), 10);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.attachmentRenameDelayMs = parsed;
					await this.plugin.saveSettings();
				});
			text.inputEl.type = 'number';
			text.inputEl.min = '0';
			text.inputEl.step = '50';
		});
		delay.addExtraButton((btn) =>
			btn
				.setIcon('rotate-ccw')
				.setTooltip(t('settings.attachments.reset'))
				.onClick(async () => {
					this.plugin.settings.attachmentRenameDelayMs =
						DEFAULT_ATTACHMENT_RENAME_DELAY_MS;
					await this.plugin.saveSettings();
					this.display();
				}),
		);
	}

	private addCssSizeSetting(
		containerEl: HTMLElement,
		opts: {
			nameKey: TranslationKey;
			descKey: TranslationKey;
			settingKey: 'modalWidth' | 'modalMaxHeight';
			fallback: string;
		},
	): void {
		const setting = new Setting(containerEl)
			.setName(t(opts.nameKey))
			.setDesc(t(opts.descKey));

		setting.addText((text) => {
			text
				.setPlaceholder(opts.fallback)
				.setValue(this.plugin.settings[opts.settingKey])
				.onChange(async (value) => {
					this.plugin.settings[opts.settingKey] = value;
					await this.plugin.saveSettings();
				});
			text.inputEl.addEventListener('blur', () => {
				const normalized = normalizeCssLengthList(
					this.plugin.settings[opts.settingKey],
					opts.fallback,
				);
				if (normalized !== this.plugin.settings[opts.settingKey]) {
					this.plugin.settings[opts.settingKey] = normalized;
					text.setValue(normalized);
					void this.plugin.saveSettings();
				}
			});
		});

		setting.addExtraButton((btn) =>
			btn
				.setIcon('rotate-ccw')
				.setTooltip(t('settings.basic.resetSize'))
				.onClick(async () => {
					this.plugin.settings[opts.settingKey] = opts.fallback;
					await this.plugin.saveSettings();
					this.display();
				}),
		);
	}

	private renderPropertyFieldsSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(t('settings.propertyFields.heading'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('settings.propertyFields.defaultCollapsed.name'))
			.setDesc(t('settings.propertyFields.defaultCollapsed.desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.propertiesDefaultCollapsed)
					.onChange(async (value) => {
						this.plugin.settings.propertiesDefaultCollapsed = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl('p', {
			text: t('settings.propertyFields.intro'),
			cls: 'setting-item-description',
		});

		const listEl = containerEl.createDiv({
			cls: 'f2-rename-setting-property-list',
		});

		const items = this.plugin.settings.propertyFields;
		items.forEach((item, index) => {
			if (item.kind === 'separator') {
				this.renderSeparatorRow(listEl, item, { scope: 'root', index });
			} else if (item.kind === 'row') {
				this.renderRowContainer(listEl, item, index);
			} else {
				this.renderFieldRow(listEl, item, { scope: 'root', index });
			}
		});

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.propertyFields.addProperty'))
					.onClick(async () => {
						this.plugin.settings.propertyFields.push(
							this.createEmptyField(),
						);
						await this.plugin.saveSettings();
						this.display();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.propertyFields.addSeparator'))
					.onClick(async () => {
						this.plugin.settings.propertyFields.push({
							kind: 'separator',
							label: '',
						});
						await this.plugin.saveSettings();
						this.display();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.propertyFields.addRow'))
					.onClick(async () => {
						this.plugin.settings.propertyFields.push({
							kind: 'row',
							label: '',
							children: [],
						});
						await this.plugin.saveSettings();
						this.display();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.propertyFields.resetDefaults'))
					.onClick(() => {
						new ConfirmModal(
							this.app,
							t('settings.propertyFields.resetConfirm.title'),
							t('settings.propertyFields.resetConfirm.message'),
							t('settings.propertyFields.resetConfirm.confirm'),
							async () => {
								this.plugin.settings.propertyFields =
									DEFAULT_PROPERTY_FIELDS.map((item) =>
										clonePropertySettingsItem(item),
									);
								await this.plugin.saveSettings();
								this.display();
							},
						).open();
					}),
			);
	}

	private createEmptyField(): PropertyFieldConfig {
		return {
			kind: 'field',
			key: '',
			type: 'text',
			label: '',
			showHint: false,
			multiline: false,
		};
	}

	private renderFieldRow(
		parent: HTMLElement,
		field: PropertyFieldConfig,
		path: DragPath,
		opts?: { nested?: boolean },
	): void {
		const row = parent.createDiv({
			cls: [
				'f2-rename-setting-property-row',
				opts?.nested ? 'is-nested' : '',
			]
				.filter(Boolean)
				.join(' '),
		});

		const handle = this.createDragHandle(row);
		this.attachDragHandlers(row, handle, path, 'field');

		const main = row.createDiv({
			cls: 'f2-rename-setting-property-main',
		});

		const line = main.createDiv({
			cls: 'f2-rename-setting-property-line',
		});

		const keyInput = this.createLabeledInput(
			line,
			t('settings.propertyFields.keyLabel'),
			field.key,
			async (value) => {
				field.key = value.trim();
				await this.plugin.saveSettings();
			},
		);
		keyInput.addClass('f2-rename-setting-key');
		keyInput.setAttr(
			'placeholder',
			t('settings.propertyFields.keyPlaceholder'),
		);
		new PropertyKeySuggest(this.app, keyInput, (key) => {
			field.key = key;
			const mapped = resolvePropertyFieldType(this.app, key);
			if (mapped) {
				field.type = mapped;
				if (!propertyTypeSupportsHint(mapped)) {
					field.showHint = false;
				}
				if (mapped !== 'text') {
					field.multiline = false;
				}
			}
			if (!field.label?.trim()) {
				field.label = key;
			}
			void (async () => {
				await this.plugin.saveSettings();
				// Always re-render so the type dropdown reflects the resolved type.
				this.display();
			})();
		});

		const typeWrap = line.createDiv({
			cls: 'f2-rename-setting-labeled',
		});
		typeWrap.createSpan({
			text: t('settings.propertyFields.typeLabel'),
			cls: 'f2-rename-setting-inline-label',
		});
		const select = typeWrap.createEl('select', {
			cls: 'dropdown f2-rename-setting-type',
		});
		for (const opt of PROPERTY_TYPE_OPTIONS) {
			select.createEl('option', {
				text: propertyTypeLabel(opt.type),
				attr: { value: opt.type },
			});
		}
		select.value = field.type;
		select.addEventListener('change', () => {
			void (async () => {
				field.type = select.value as PropertyFieldType;
				if (!propertyTypeSupportsHint(field.type)) {
					field.showHint = false;
				}
				if (field.type !== 'text') {
					field.multiline = false;
				}
				await this.plugin.saveSettings();
				this.display();
			})();
		});

		this.createLabeledInput(
			line,
			t('settings.propertyFields.aliasLabel'),
			field.label ?? '',
			async (value) => {
				field.label = value;
				await this.plugin.saveSettings();
			},
		).addClass('f2-rename-setting-alias');

		if (propertyTypeSupportsHint(field.type)) {
			const hintToggle = line.createDiv({
				cls: 'f2-rename-setting-labeled f2-rename-setting-hint-toggle',
			});
			hintToggle.createSpan({
				text: t('settings.propertyFields.showHintLabel'),
				cls: 'f2-rename-setting-inline-label',
			});
			const checkbox = hintToggle.createEl('input', {
				type: 'checkbox',
				cls: 'f2-rename-setting-show-hint',
			});
			checkbox.checked = field.showHint === true;
			checkbox.addEventListener('change', () => {
				field.showHint = checkbox.checked;
				void this.plugin.saveSettings();
			});
		}

		if (field.type === 'text') {
			const multiToggle = line.createDiv({
				cls: 'f2-rename-setting-labeled f2-rename-setting-multiline-toggle',
			});
			multiToggle.createSpan({
				text: t('settings.propertyFields.multilineLabel'),
				cls: 'f2-rename-setting-inline-label',
			});
			const checkbox = multiToggle.createEl('input', {
				type: 'checkbox',
				cls: 'f2-rename-setting-multiline',
			});
			checkbox.checked = field.multiline === true;
			checkbox.addEventListener('change', () => {
				field.multiline = checkbox.checked;
				void this.plugin.saveSettings();
			});
		}

		this.createDeleteButton(row, () => {
			this.removeAtPath(path);
		});
	}

	private renderSeparatorRow(
		parent: HTMLElement,
		item: Extract<PropertySettingsItem, { kind: 'separator' }>,
		path: DragPath,
	): void {
		const row = parent.createDiv({
			cls: 'f2-rename-setting-property-row f2-rename-setting-separator-row',
		});

		const handle = this.createDragHandle(row);
		this.attachDragHandlers(row, handle, path, 'separator');

		const main = row.createDiv({
			cls: 'f2-rename-setting-property-main',
		});
		const line = main.createDiv({
			cls: 'f2-rename-setting-property-line',
		});

		line.createSpan({
			text: t('settings.propertyFields.separatorBadge'),
			cls: 'f2-rename-setting-separator-badge',
		});

		this.createLabeledInput(
			line,
			t('settings.propertyFields.separatorTitleLabel'),
			item.label ?? '',
			async (value) => {
				item.label = value;
				await this.plugin.saveSettings();
			},
		).addClass('f2-rename-setting-separator-label');

		this.createDeleteButton(row, () => {
			this.removeAtPath(path);
		});
	}

	private renderRowContainer(
		parent: HTMLElement,
		item: PropertyRowConfig,
		rowIndex: number,
	): void {
		const path: DragPath = { scope: 'root', index: rowIndex };
		const row = parent.createDiv({
			cls: 'f2-rename-setting-property-row f2-rename-setting-row-container',
		});

		const header = row.createDiv({
			cls: 'f2-rename-setting-row-header',
		});

		const handle = this.createDragHandle(header);
		this.attachDragHandlers(row, handle, path, 'row');

		const headerMain = header.createDiv({
			cls: 'f2-rename-setting-row-header-main',
		});
		headerMain.createSpan({
			text: t('settings.propertyFields.rowBadge'),
			cls: 'f2-rename-setting-row-badge',
		});

		const addBtn = headerMain.createEl('button', {
			cls: 'mod-cta f2-rename-setting-row-add',
			text: t('settings.propertyFields.addProperty'),
			attr: { type: 'button' },
		});
		addBtn.addEventListener('click', () => {
			item.children.push(this.createEmptyField());
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});

		this.createDeleteButton(header, () => {
			this.plugin.settings.propertyFields.splice(rowIndex, 1);
		});

		const body = row.createDiv({
			cls: 'f2-rename-setting-row-body',
		});
		body.dataset.rowIndex = String(rowIndex);

		if (item.children.length === 0) {
			body.createDiv({
				cls: 'f2-rename-setting-row-empty',
				text: t('settings.propertyFields.rowEmptyHint'),
			});
		}

		item.children.forEach((child, childIndex) => {
			this.renderFieldRow(
				body,
				child,
				{ scope: 'row', rowIndex, index: childIndex },
				{ nested: true },
			);
		});

		this.attachRowBodyDrop(body, rowIndex);
	}

	private createDragHandle(row: HTMLElement): HTMLElement {
		const handle = row.createDiv({
			cls: 'f2-rename-setting-drag-handle',
			attr: {
				'aria-label': t('common.dragToReorder'),
			},
		});
		setIcon(handle, 'grip-vertical');
		return handle;
	}

	private createDeleteButton(
		row: HTMLElement,
		onDelete: () => void,
	): void {
		const btn = row.createEl('button', {
			cls: 'clickable-icon f2-rename-setting-remove',
			attr: {
				type: 'button',
				'aria-label': t('common.remove'),
			},
		});
		setIcon(btn, 'trash-2');
		btn.addEventListener('click', () => {
			onDelete();
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}

	private createLabeledInput(
		parent: HTMLElement,
		label: string,
		value: string,
		onChange: (value: string) => void | Promise<void>,
	): HTMLInputElement {
		const wrap = parent.createDiv({
			cls: 'f2-rename-setting-labeled',
		});
		wrap.createSpan({
			text: label,
			cls: 'f2-rename-setting-inline-label',
		});
		const input = wrap.createEl('input', {
			type: 'text',
			cls: 'f2-rename-setting-input',
			value,
		});
		input.addEventListener('change', () => {
			void onChange(input.value);
		});
		input.addEventListener('blur', () => {
			void onChange(input.value);
		});
		return input;
	}

	private removeAtPath(path: DragPath): void {
		if (path.scope === 'root') {
			this.plugin.settings.propertyFields.splice(path.index, 1);
			return;
		}
		const row = this.plugin.settings.propertyFields[path.rowIndex];
		if (!row || !isPropertyRow(row)) return;
		row.children.splice(path.index, 1);
	}

	private takeAtPath(path: DragPath): PropertySettingsItem | null {
		if (path.scope === 'root') {
			const [item] = this.plugin.settings.propertyFields.splice(
				path.index,
				1,
			);
			return item ?? null;
		}
		const row = this.plugin.settings.propertyFields[path.rowIndex];
		if (!row || !isPropertyRow(row)) return null;
		const [child] = row.children.splice(path.index, 1);
		return child ?? null;
	}

	private insertAtRoot(index: number, item: PropertySettingsItem): void {
		const list = this.plugin.settings.propertyFields;
		const clamped = Math.max(0, Math.min(index, list.length));
		list.splice(clamped, 0, item);
	}

	private insertIntoRow(
		rowIndex: number,
		childIndex: number,
		field: PropertyFieldConfig,
	): void {
		const row = this.plugin.settings.propertyFields[rowIndex];
		if (!row || !isPropertyRow(row)) return;
		const clamped = Math.max(0, Math.min(childIndex, row.children.length));
		row.children.splice(clamped, 0, field);
	}

	private samePath(a: DragPath, b: DragPath): boolean {
		if (a.scope !== b.scope) return false;
		if (a.scope === 'root' && b.scope === 'root') {
			return a.index === b.index;
		}
		if (a.scope === 'row' && b.scope === 'row') {
			return a.rowIndex === b.rowIndex && a.index === b.index;
		}
		return false;
	}

	private attachRowBodyDrop(body: HTMLElement, rowIndex: number): void {
		body.addEventListener('dragover', (event) => {
			const from = this.dragPath;
			if (!from) return;
			if (from.scope === 'root') {
				const item = this.plugin.settings.propertyFields[from.index];
				if (!item || !isPropertyField(item)) return;
			}
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			body.addClass('is-drop-target');
		});

		body.addEventListener('dragleave', (event) => {
			const related = event.relatedTarget as Node | null;
			if (related && body.contains(related)) return;
			body.removeClass('is-drop-target');
		});

		body.addEventListener('drop', (event) => {
			event.preventDefault();
			event.stopPropagation();
			body.removeClass('is-drop-target');
			const from = this.readDragPath(event) ?? this.dragPath;
			if (!from) return;

			let insertAt = this.plugin.settings.propertyFields[rowIndex];
			if (!insertAt || !isPropertyRow(insertAt)) return;

			// Dropping onto empty area → append
			let childIndex = insertAt.children.length;

			// If dropping onto a nested child, use that child's index
			const nested = (event.target as HTMLElement | null)?.closest(
				'.f2-rename-setting-property-row.is-nested',
			) as HTMLElement | null;
			if (nested && body.contains(nested)) {
				const rows = Array.from(
					body.querySelectorAll(
						':scope > .f2-rename-setting-property-row.is-nested',
					),
				);
				const idx = rows.indexOf(nested);
				if (idx >= 0) {
					const rect = nested.getBoundingClientRect();
					childIndex =
						event.clientY < rect.top + rect.height / 2
							? idx
							: idx + 1;
				}
			}

			if (
				from.scope === 'row' &&
				from.rowIndex === rowIndex &&
				from.index < childIndex
			) {
				childIndex -= 1;
			}

			const moved = this.takeAtPath(from);
			if (!moved || !isPropertyField(moved)) {
				if (moved) this.restoreTaken(from, moved);
				return;
			}

			// Re-resolve row after possible splice that shifted indices
			let targetRowIndex = rowIndex;
			if (from.scope === 'root' && from.index < rowIndex) {
				targetRowIndex -= 1;
			}
			this.insertIntoRow(targetRowIndex, childIndex, moved);
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}

	private restoreTaken(path: DragPath, item: PropertySettingsItem): void {
		if (path.scope === 'root') {
			this.insertAtRoot(path.index, item);
		} else if (isPropertyField(item)) {
			this.insertIntoRow(path.rowIndex, path.index, item);
		}
	}

	private attachDragHandlers(
		row: HTMLElement,
		handle: HTMLElement,
		path: DragPath,
		kind: 'field' | 'separator' | 'row',
	): void {
		handle.setAttr('draggable', 'true');

		handle.addEventListener('dragstart', (event) => {
			this.dragPath = path;
			row.addClass('is-dragging');
			event.dataTransfer?.setData(DRAG_MIME, JSON.stringify(path));
			event.dataTransfer?.setData('text/plain', JSON.stringify(path));
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
			row.dataset.dragKind = kind;
		});

		handle.addEventListener('dragend', () => {
			row.removeClass('is-dragging');
			this.dragPath = null;
			clearDropTargets(this.containerEl);
		});

		row.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
			const from = this.dragPath;
			if (!from || this.samePath(from, path)) return;

			// Nested field rows: only accept field drops for reorder within / into handled by body
			if (path.scope === 'row') {
				if (from.scope === 'root') {
					const src = this.plugin.settings.propertyFields[from.index];
					if (!src || !isPropertyField(src)) return;
				}
			}

			clearDropTargets(this.containerEl);
			const rect = row.getBoundingClientRect();
			const before = event.clientY < rect.top + rect.height / 2;
			row.addClass(before ? 'drop-before' : 'drop-after');
		});

		row.addEventListener('dragleave', (event) => {
			const related = event.relatedTarget as Node | null;
			if (related && row.contains(related)) return;
			row.removeClass('drop-before');
			row.removeClass('drop-after');
		});

		row.addEventListener('drop', (event) => {
			const target = event.target as HTMLElement | null;
			if (
				path.scope === 'root' &&
				kind === 'row' &&
				target?.closest('.f2-rename-setting-row-body')
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			row.removeClass('drop-before');
			row.removeClass('drop-after');

			const from = this.readDragPath(event) ?? this.dragPath;
			if (!from || this.samePath(from, path)) return;

			// Dropping a field onto a row container (header) puts it inside.
			if (path.scope === 'root' && kind === 'row') {
				const src =
					from.scope === 'root'
						? this.plugin.settings.propertyFields[from.index]
						: null;
				const isField =
					from.scope === 'row' ||
					(src != null && isPropertyField(src));
				if (isField) {
					const moved = this.takeAtPath(from);
					if (!moved || !isPropertyField(moved)) {
						if (moved) this.restoreTaken(from, moved);
						return;
					}
					let rowIndex = path.index;
					if (from.scope === 'root' && from.index < path.index) {
						rowIndex -= 1;
					}
					const rowItem =
						this.plugin.settings.propertyFields[rowIndex];
					const insertAt =
						rowItem && isPropertyRow(rowItem)
							? rowItem.children.length
							: 0;
					this.insertIntoRow(rowIndex, insertAt, moved);
					void (async () => {
						await this.plugin.saveSettings();
						this.display();
					})();
					return;
				}
			}

			const rect = row.getBoundingClientRect();
			const before = event.clientY < rect.top + rect.height / 2;

			void this.moveItem(from, path, before);
		});
	}

	private readDragPath(event: DragEvent): DragPath | null {
		const raw =
			event.dataTransfer?.getData(DRAG_MIME) ||
			event.dataTransfer?.getData('text/plain');
		if (!raw) return null;
		try {
			return JSON.parse(raw) as DragPath;
		} catch {
			return null;
		}
	}

	private async moveItem(
		from: DragPath,
		to: DragPath,
		before: boolean,
	): Promise<void> {
		// Dropping a field onto a root row container edge → insert beside the container at root
		// Dropping into row children is handled by attachRowBodyDrop

		if (to.scope === 'row') {
			// Only fields can live inside rows
			const peek =
				from.scope === 'root'
					? this.plugin.settings.propertyFields[from.index]
					: null;
			if (from.scope === 'root' && peek && !isPropertyField(peek)) {
				return;
			}

			let insertIndex = before ? to.index : to.index + 1;
			if (
				from.scope === 'row' &&
				from.rowIndex === to.rowIndex &&
				from.index < insertIndex
			) {
				insertIndex -= 1;
			}

			const moved = this.takeAtPath(from);
			if (!moved || !isPropertyField(moved)) {
				if (moved) this.restoreTaken(from, moved);
				return;
			}

			let rowIndex = to.rowIndex;
			if (from.scope === 'root' && from.index < to.rowIndex) {
				rowIndex -= 1;
			}
			this.insertIntoRow(rowIndex, insertIndex, moved);
			await this.plugin.saveSettings();
			this.display();
			return;
		}

		// Target is root
		let insertIndex = before ? to.index : to.index + 1;

		// Special: drop field onto row container — if dropping "into" center of row, put inside
		const targetItem = this.plugin.settings.propertyFields[to.index];
		if (
			targetItem &&
			isPropertyRow(targetItem) &&
			from.scope === 'root'
		) {
			const src = this.plugin.settings.propertyFields[from.index];
			if (src && isPropertyField(src)) {
				// Use before/after for sibling placement at root (already computed)
			}
		}

		if (from.scope === 'root' && from.index < insertIndex) {
			insertIndex -= 1;
		}
		if (from.scope === 'root' && from.index === to.index) return;

		const moved = this.takeAtPath(from);
		if (!moved) return;

		if (from.scope === 'row' && !isPropertyField(moved)) {
			this.restoreTaken(from, moved);
			return;
		}

		// Adjust insert index if we removed from a row that sits before target
		if (from.scope === 'row' && from.rowIndex < to.index) {
			// root length unchanged for insert position of root items after the row
		}
		if (from.scope === 'root' && from.index < to.index) {
			// already adjusted
		}

		this.insertAtRoot(insertIndex, moved);
		await this.plugin.saveSettings();
		this.display();
	}
}

function clearDropTargets(parent: HTMLElement | null): void {
	if (!parent) return;
	parent
		.querySelectorAll(
			'.f2-rename-setting-property-row.drop-before, .f2-rename-setting-property-row.drop-after, .f2-rename-setting-row-body.is-drop-target',
		)
		.forEach((el) => {
			el.removeClass('drop-before');
			el.removeClass('drop-after');
			el.removeClass('is-drop-target');
		});
}
