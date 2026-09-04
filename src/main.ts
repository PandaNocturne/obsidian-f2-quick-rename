import { Plugin } from 'obsidian';
import { RenameService } from './rename-service';
import {
	DEFAULT_PROPERTY_FIELDS,
	DEFAULT_SETTINGS,
	normalizePropertySettingsItem,
	type F2RenameSettings,
} from './settings';
import { F2RenameSettingTab } from './ui/settings-tab';

export default class F2RenamePlugin extends Plugin {
	settings!: F2RenameSettings;
	private renameService!: RenameService;

	async onload() {
		const saved = (await this.loadData()) as Partial<F2RenameSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		if (!Array.isArray(this.settings.propertyFields)) {
			this.settings.propertyFields = DEFAULT_PROPERTY_FIELDS.map((item) =>
				normalizePropertySettingsItem(item),
			);
		} else {
			this.settings.propertyFields = this.settings.propertyFields.map(
				(item) => normalizePropertySettingsItem(item),
			);
		}

		this.renameService = new RenameService(this);

		this.addCommand({
			id: 'f2-rename',
			name: '重命名文件或嵌入',
			hotkeys: [{ modifiers: [], key: 'F2' }],
			callback: () => {
				void this.renameService.run();
			},
		});

		this.addSettingTab(new F2RenameSettingTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onunload() {}
}
