import { Plugin, TFile } from 'obsidian';
import { setLocalePreference, t } from './i18n';
import { RenameService } from './rename-service';
import {
	DEFAULT_PROPERTY_FIELDS,
	DEFAULT_SETTINGS,
	normalizePropertySettingsItem,
	type F2RenameSettings,
} from './settings';
import {
	DEFAULT_MODAL_MAX_HEIGHT,
	DEFAULT_MODAL_WIDTH,
	normalizeCssLengthList,
} from './utils/css-size';
import { F2RenameSettingTab } from './ui/settings-tab';

export default class F2RenamePlugin extends Plugin {
	settings!: F2RenameSettings;
	private renameService!: RenameService;

	async onload() {
		const saved = (await this.loadData()) as Partial<F2RenameSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		if (
			this.settings.locale !== 'system' &&
			this.settings.locale !== 'zh-CN' &&
			this.settings.locale !== 'en'
		) {
			this.settings.locale = DEFAULT_SETTINGS.locale;
		}
		setLocalePreference(this.settings.locale);

		this.settings.modalWidth = normalizeCssLengthList(
			this.settings.modalWidth,
			DEFAULT_MODAL_WIDTH,
		);
		this.settings.modalMaxHeight = normalizeCssLengthList(
			this.settings.modalMaxHeight,
			DEFAULT_MODAL_MAX_HEIGHT,
		);

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
			name: t('commands.renameFileOrEmbed'),
			hotkeys: [{ modifiers: [], key: 'F2' }],
			callback: () => {
				void this.renameService.run();
			},
		});

		this.addCommand({
			id: 'f5-full-properties',
			name: t('commands.renameAndEditAllProperties'),
			hotkeys: [{ modifiers: [], key: 'F5' }],
			callback: () => {
				void this.renameService.runFullProperties();
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;
				menu.addItem((item) => {
					item
						.setTitle(t('menu.f2Rename'))
						.setIcon('pencil')
						.onClick(() => {
							void this.renameService.runForFile(file);
						});
				});
			}),
		);

		this.addSettingTab(new F2RenameSettingTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		setLocalePreference(this.settings.locale);
		await this.saveData(this.settings);
	}

	onunload() {}
}
