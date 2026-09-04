import { Plugin } from 'obsidian';
import { RenameService } from './rename-service';
import { DEFAULT_SETTINGS, type F2RenameSettings } from './settings';
import { F2RenameSettingTab } from './ui/settings-tab';

export default class F2RenamePlugin extends Plugin {
	settings!: F2RenameSettings;
	private renameService!: RenameService;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<F2RenameSettings>,
		);

		this.renameService = new RenameService(this);

		this.addCommand({
			id: 'f2-rename',
			name: '重命名文件或嵌入',
			// Plugin identity is F2 Rename; default hotkey is intentional.
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
