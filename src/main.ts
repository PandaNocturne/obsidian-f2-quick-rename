import { Plugin } from 'obsidian';
import { RenameService } from './rename-service';

export default class F2RenamePlugin extends Plugin {
	private renameService!: RenameService;

	async onload() {
		this.renameService = new RenameService(this.app);

		this.addCommand({
			id: 'f2-rename',
			name: '重命名文件或嵌入',
			// Plugin identity is F2 Rename; default hotkey is intentional.
			hotkeys: [{ modifiers: [], key: 'F2' }],
			callback: () => {
				void this.renameService.run();
			},
		});
	}

	onunload() {}
}
