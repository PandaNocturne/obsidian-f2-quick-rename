import { App, PluginSettingTab, Setting } from 'obsidian';
import type F2RenamePlugin from '../main';
import type { F2RenameSettings } from '../settings';

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
	}
}
