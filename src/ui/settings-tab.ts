import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type F2RenamePlugin from '../main';
import {
	DEFAULT_PROPERTY_FIELDS,
	PROPERTY_TYPE_OPTIONS,
	type F2RenameSettings,
	type PropertyFieldConfig,
	type PropertyFieldType,
} from '../settings';

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

	constructor(app: App, plugin: F2RenamePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
			text: '配置重命名面板「更多」中可编辑的属性。类型与 Obsidian 属性类型一致。',
			cls: 'setting-item-description',
		});

		const fields = this.plugin.settings.propertyFields;

		fields.forEach((field, index) => {
			const row = new Setting(containerEl);
			row.settingEl.addClass('f2-rename-setting-property');

			row.addText((text) => {
				text.setPlaceholder('属性名，如 title')
					.setValue(field.key)
					.onChange(async (value) => {
						field.key = value.trim();
						if (!field.label || field.label === field.key) {
							// keep label in sync when it was mirroring key
						}
						await this.plugin.saveSettings();
					});
				text.inputEl.addClass('f2-rename-setting-key');
			});

			row.addDropdown((dropdown) => {
				for (const opt of PROPERTY_TYPE_OPTIONS) {
					dropdown.addOption(opt.type, opt.label);
				}
				dropdown.setValue(field.type).onChange(async (value) => {
					field.type = value as PropertyFieldType;
					await this.plugin.saveSettings();
					this.display();
				});
			});

			row.addText((text) => {
				text
					.setPlaceholder(
						field.type === 'list' ? '添加提示，如 添加标签' : '显示名（可选）',
					)
					.setValue(
						field.type === 'list'
							? (field.hint ?? '')
							: (field.label ?? ''),
					)
					.onChange(async (value) => {
						if (field.type === 'list') {
							field.hint = value;
						} else {
							field.label = value;
						}
						await this.plugin.saveSettings();
					});
				text.inputEl.addClass('f2-rename-setting-meta');
			});

			row.addExtraButton((btn) => {
				btn.setIcon('trash-2')
					.setTooltip('移除')
					.onClick(async () => {
						this.plugin.settings.propertyFields.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					});
			});

			const typeOpt = PROPERTY_TYPE_OPTIONS.find(
				(o) => o.type === field.type,
			);
			if (typeOpt) {
				const iconEl = row.nameEl.createSpan({
					cls: 'f2-rename-setting-type-icon',
				});
				setIcon(iconEl, typeOpt.icon);
				row.setName(typeOpt.label);
			}
		});

		new Setting(containerEl)
			.addButton((btn) =>
				btn.setButtonText('添加属性').onClick(async () => {
					const next: PropertyFieldConfig = {
						key: '',
						type: 'text',
						label: '',
						hint: '',
					};
					this.plugin.settings.propertyFields.push(next);
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('恢复默认').onClick(async () => {
					this.plugin.settings.propertyFields =
						DEFAULT_PROPERTY_FIELDS.map((f) => ({ ...f }));
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}
