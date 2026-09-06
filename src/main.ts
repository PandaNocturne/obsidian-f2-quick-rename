import { Plugin, TFile } from 'obsidian';
import { setLocalePreference, t } from './i18n';
import { AttachmentRenameService } from './attachment-rename-service';
import { RenameService } from './rename-service';
import {
	DEFAULT_PROPERTY_FIELDS,
	DEFAULT_SETTINGS,
	normalizePropertySettingsItem,
	type F2RenameSettings,
} from './settings';
import {
	DEFAULT_ATTACHMENT_EXTENSIONS,
	DEFAULT_ATTACHMENT_NAME_TEMPLATE,
	DEFAULT_ATTACHMENT_RENAME_DELAY_MS,
} from './utils/attachments';
import { DEFAULT_COPY_ON_DELETE_TYPES } from './utils/file-delete';
import {
	DEFAULT_MODAL_MAX_HEIGHT,
	DEFAULT_MODAL_WIDTH,
	normalizeCssLengthList,
} from './utils/css-size';
import { F2RenameSettingTab } from './ui/settings-tab';

export default class F2RenamePlugin extends Plugin {
	settings!: F2RenameSettings;
	private renameService!: RenameService;
	private attachmentRenameService!: AttachmentRenameService;

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

		if (typeof this.settings.attachmentExtensions !== 'string') {
			this.settings.attachmentExtensions = DEFAULT_ATTACHMENT_EXTENSIONS;
		}
		if (typeof this.settings.attachmentNameTemplate !== 'string') {
			this.settings.attachmentNameTemplate =
				DEFAULT_ATTACHMENT_NAME_TEMPLATE;
		}
		if (
			typeof this.settings.attachmentRenameDelayMs !== 'number' ||
			!Number.isFinite(this.settings.attachmentRenameDelayMs) ||
			this.settings.attachmentRenameDelayMs < 0
		) {
			this.settings.attachmentRenameDelayMs =
				DEFAULT_ATTACHMENT_RENAME_DELAY_MS;
		}
		if (typeof this.settings.attachmentSilentMode !== 'boolean') {
			this.settings.attachmentSilentMode = false;
		}
		if (typeof this.settings.showHeaderDelete !== 'boolean') {
			this.settings.showHeaderDelete = true;
		}
		if (typeof this.settings.confirmBeforeDelete !== 'boolean') {
			this.settings.confirmBeforeDelete = true;
		}
		if (typeof this.settings.copyOnDeleteTypes !== 'string') {
			this.settings.copyOnDeleteTypes = DEFAULT_COPY_ON_DELETE_TYPES;
		}

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
		this.attachmentRenameService = new AttachmentRenameService(this);

		this.addCommand({
			id: 'f2-rename',
			name: t('commands.renameFileOrEmbed'),
			hotkeys: [{ modifiers: [], key: 'F2' }],
			callback: () => {
				void this.renameService.run();
			},
		});

		this.addCommand({
			id: 'copy-and-delete',
			name: t('commands.copyAndDelete'),
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'X' }],
			callback: () => {
				void this.renameService.runCopyAndDelete();
			},
		});

		this.addCommand({
			id: 'rename-attachments',
			name: t('commands.renameAttachments'),
			hotkeys: [{ modifiers: [], key: 'F1' }],
			callback: () => {
				void this.attachmentRenameService.run();
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
