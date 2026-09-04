import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type F2RenamePlugin from '../main';
import {
	DEFAULT_PROPERTY_FIELDS,
	PROPERTY_TYPE_OPTIONS,
	type F2RenameSettings,
	type PropertyFieldConfig,
	type PropertyFieldType,
	type PropertySettingsItem,
} from '../settings';
import {
	PropertyKeySuggest,
	getRegisteredPropertyType,
	mapObsidianPropertyType,
} from './tag-suggest';

type ToggleKey = {
	[K in keyof F2RenameSettings]: F2RenameSettings[K] extends boolean
		? K
		: never;
}[keyof F2RenameSettings];

interface ToggleOption {
	key: ToggleKey;
	name: string;
	desc: string;
}

const TOGGLE_OPTIONS: ToggleOption[] = [
	{
		key: 'renameEmbeds',
		name: '重命名嵌入文件',
		desc: '光标落在 wiki / Markdown 嵌入上时，重命名被嵌入的文件，而不是当前笔记。',
	},
	{
		key: 'editEmbedAlias',
		name: '编辑嵌入别名',
		desc: '重命名嵌入时显示别名字段，可修改 ![[文件|别名]] 或 ![别名](文件) 的显示名。',
	},
	{
		key: 'renameHeadings',
		name: '重命名标题',
		desc: '选中或光标所在行为标题时，调用 Obsidian 自带的「重命名标题」。',
	},
	{
		key: 'renameCompanions',
		name: '连带重命名同名文件',
		desc: '同文件夹、同主文件名、不同扩展名的文件一并重命名（例如 note.md 与 note.canvas）。',
	},
	{
		key: 'copyNameToClipboard',
		name: '复制新名称到剪贴板',
		desc: '重命名当前打开的笔记后，将新主文件名写入剪贴板（重命名嵌入时不复制）。',
	},
	{
		key: 'editProperties',
		name: '编辑文档属性',
		desc: '重命名当前笔记或可识别的嵌入 Markdown 文档时，在「更多」中编辑配置的 frontmatter 属性。',
	},
	{
		key: 'autoSaveProperties',
		name: '属性编辑自动保存',
		desc: '在「更多」中修改属性后立即写入笔记，无需点击确认。关闭后需点击「重命名」才会保存属性。',
	},
];

export class F2RenameSettingTab extends PluginSettingTab {
	plugin: F2RenamePlugin;
	private dragFromIndex: number | null = null;

	constructor(app: App, plugin: F2RenamePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.dragFromIndex = null;

		new Setting(containerEl).setName('功能开关').setHeading();

		containerEl.createEl('p', {
			text: '关闭后对应功能不会触发。',
			cls: 'setting-item-description',
		});

		for (const option of TOGGLE_OPTIONS) {
			new Setting(containerEl)
				.setName(option.name)
				.setDesc(option.desc)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[option.key])
						.onChange(async (value) => {
							this.plugin.settings[option.key] = value;
							await this.plugin.saveSettings();
						}),
				);
		}

		this.renderPropertyFieldsSection(containerEl);
	}

	private renderPropertyFieldsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('文档属性').setHeading();

		containerEl.createEl('p', {
			text: '配置重命名面板「更多」中可编辑的属性。拖动左侧手柄调整顺序；可插入分隔符。列表开启「提示」后，输入时会从库中该属性已有值弹出下拉建议。',
			cls: 'setting-item-description',
		});

		const listEl = containerEl.createDiv({
			cls: 'f2-rename-setting-property-list',
		});

		const items = this.plugin.settings.propertyFields;
		items.forEach((item, index) => {
			if (item.kind === 'separator') {
				this.renderSeparatorRow(listEl, item, index);
			} else {
				this.renderFieldRow(listEl, item, index);
			}
		});

		new Setting(containerEl)
			.addButton((btn) =>
				btn.setButtonText('添加属性').onClick(async () => {
					const next: PropertyFieldConfig = {
						kind: 'field',
						key: '',
						type: 'text',
						label: '',
						showHint: false,
					};
					this.plugin.settings.propertyFields.push(next);
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('添加分隔符').onClick(async () => {
					this.plugin.settings.propertyFields.push({
						kind: 'separator',
						label: '',
					});
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('恢复默认').onClick(async () => {
					this.plugin.settings.propertyFields =
						DEFAULT_PROPERTY_FIELDS.map((item) =>
							item.kind === 'separator'
								? { ...item }
								: { ...item },
						);
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}

	private renderFieldRow(
		parent: HTMLElement,
		field: PropertyFieldConfig,
		index: number,
	): void {
		const row = parent.createDiv({
			cls: 'f2-rename-setting-property-row',
		});
		row.dataset.index = String(index);

		const handle = this.createDragHandle(row);
		this.attachDragHandlers(row, handle, index);

		const main = row.createDiv({
			cls: 'f2-rename-setting-property-main',
		});

		const line = main.createDiv({
			cls: 'f2-rename-setting-property-line',
		});

		const keyInput = this.createLabeledInput(
			line,
			'属性名',
			field.key,
			async (value) => {
				field.key = value.trim();
				await this.plugin.saveSettings();
			},
		);
		keyInput.addClass('f2-rename-setting-key');
		keyInput.setAttr('placeholder', '从库中选择或输入');
		new PropertyKeySuggest(this.app, keyInput, (key) => {
			const prevType = field.type;
			field.key = key;
			const mapped = mapObsidianPropertyType(
				getRegisteredPropertyType(this.app, key),
			);
			if (mapped) {
				field.type = mapped;
				if (mapped !== 'list') {
					field.showHint = false;
				}
			}
			if (!field.label?.trim()) {
				field.label = key;
			}
			void (async () => {
				await this.plugin.saveSettings();
				if (field.type !== prevType) {
					this.display();
				} else {
					keyInput.value = key;
				}
			})();
		});

		const typeWrap = line.createDiv({
			cls: 'f2-rename-setting-labeled',
		});
		typeWrap.createSpan({
			text: '类型',
			cls: 'f2-rename-setting-inline-label',
		});
		const select = typeWrap.createEl('select', {
			cls: 'dropdown f2-rename-setting-type',
		});
		for (const opt of PROPERTY_TYPE_OPTIONS) {
			select.createEl('option', {
				text: opt.label,
				attr: { value: opt.type },
			});
		}
		select.value = field.type;
		select.addEventListener('change', () => {
			void (async () => {
				field.type = select.value as PropertyFieldType;
				if (field.type !== 'list') {
					field.showHint = false;
				}
				await this.plugin.saveSettings();
				this.display();
			})();
		});

		this.createLabeledInput(
			line,
			'别名',
			field.label ?? '',
			async (value) => {
				field.label = value;
				await this.plugin.saveSettings();
			},
		).addClass('f2-rename-setting-alias');

		if (field.type === 'list') {
			const hintToggle = line.createDiv({
				cls: 'f2-rename-setting-labeled f2-rename-setting-hint-toggle',
			});
			hintToggle.createSpan({
				text: '提示',
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

		this.createDeleteButton(row, index);
	}

	private renderSeparatorRow(
		parent: HTMLElement,
		item: Extract<PropertySettingsItem, { kind: 'separator' }>,
		index: number,
	): void {
		const row = parent.createDiv({
			cls: 'f2-rename-setting-property-row f2-rename-setting-separator-row',
		});
		row.dataset.index = String(index);

		const handle = this.createDragHandle(row);
		this.attachDragHandlers(row, handle, index);

		const main = row.createDiv({
			cls: 'f2-rename-setting-property-main',
		});
		const line = main.createDiv({
			cls: 'f2-rename-setting-property-line',
		});

		line.createSpan({
			text: '分隔符',
			cls: 'f2-rename-setting-separator-badge',
		});

		this.createLabeledInput(
			line,
			'标题（可选）',
			item.label ?? '',
			async (value) => {
				item.label = value;
				await this.plugin.saveSettings();
			},
		).addClass('f2-rename-setting-separator-label');

		this.createDeleteButton(row, index);
	}

	private createDragHandle(row: HTMLElement): HTMLElement {
		const handle = row.createDiv({
			cls: 'f2-rename-setting-drag-handle',
			attr: {
				title: '拖动排序',
				'aria-label': '拖动排序',
			},
		});
		setIcon(handle, 'grip-vertical');
		return handle;
	}

	private createDeleteButton(row: HTMLElement, index: number): void {
		const btn = row.createEl('button', {
			cls: 'clickable-icon f2-rename-setting-remove',
			attr: {
				type: 'button',
				'aria-label': '移除',
			},
		});
		setIcon(btn, 'trash-2');
		btn.addEventListener('click', () => {
			void (async () => {
				this.plugin.settings.propertyFields.splice(index, 1);
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

	private attachDragHandlers(
		row: HTMLElement,
		handle: HTMLElement,
		index: number,
	): void {
		handle.setAttr('draggable', 'true');

		handle.addEventListener('dragstart', (event) => {
			this.dragFromIndex = index;
			row.addClass('is-dragging');
			event.dataTransfer?.setData('text/plain', String(index));
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
		});

		handle.addEventListener('dragend', () => {
			row.removeClass('is-dragging');
			this.dragFromIndex = null;
			clearDropTargets(row.parentElement);
		});

		row.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
			if (this.dragFromIndex === null || this.dragFromIndex === index) {
				return;
			}
			clearDropTargets(row.parentElement);
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
			event.preventDefault();
			row.removeClass('drop-before');
			row.removeClass('drop-after');

			const from =
				this.dragFromIndex ??
				Number(event.dataTransfer?.getData('text/plain'));
			if (!Number.isFinite(from) || from === index) return;

			const rect = row.getBoundingClientRect();
			const before = event.clientY < rect.top + rect.height / 2;
			let to = before ? index : index + 1;
			if (from < to) to -= 1;
			if (from === to) return;

			const list = this.plugin.settings.propertyFields;
			const [moved] = list.splice(from, 1);
			if (!moved) return;
			list.splice(to, 0, moved);
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}
}

function clearDropTargets(parent: HTMLElement | null): void {
	if (!parent) return;
	parent
		.querySelectorAll(
			'.f2-rename-setting-property-row.drop-before, .f2-rename-setting-property-row.drop-after',
		)
		.forEach((el) => {
			el.removeClass('drop-before');
			el.removeClass('drop-after');
		});
}
