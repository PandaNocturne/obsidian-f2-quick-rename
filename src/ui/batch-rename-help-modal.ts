import { App, Modal } from 'obsidian';
import { t, type TranslationKey } from '../i18n';

const HELP_ROWS: ReadonlyArray<{
	syntax: string;
	meaningKey: TranslationKey;
}> = [
	{ syntax: '{name}', meaningKey: 'modal.batch.help.token.name' },
	{ syntax: '{ext}', meaningKey: 'modal.batch.help.token.ext' },
	{ syntax: '{n} / {index}', meaningKey: 'modal.batch.help.token.index' },
	{
		syntax: '{n:3} / {index:3}',
		meaningKey: 'modal.batch.help.token.indexPad',
	},
	{ syntax: '{date}', meaningKey: 'modal.batch.help.token.date' },
	{
		syntax: '{date:YYYY-MM-DD}',
		meaningKey: 'modal.batch.help.token.dateFmt',
	},
	{
		syntax: '{ctime} / {ctime:YYYYMMDDHHmm}',
		meaningKey: 'modal.batch.help.token.ctime',
	},
	{
		syntax: '{mtime} / {mtime:…}',
		meaningKey: 'modal.batch.help.token.mtime',
	},
	{ syntax: '{folder}', meaningKey: 'modal.batch.help.token.folder' },
];

/** Popup explaining format-template placeholders for batch rename. */
export class BatchRenameHelpModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('f2-batch-help-modal');

		contentEl.createEl('h2', {
			text: t('modal.batch.helpTitle'),
			cls: 'f2-batch-help-title',
		});

		const table = contentEl.createEl('table', {
			cls: 'f2-batch-help-table',
		});
		const thead = table.createEl('thead');
		const headRow = thead.createEl('tr');
		headRow.createEl('th', { text: t('modal.batch.help.syntax') });
		headRow.createEl('th', { text: t('modal.batch.help.meaning') });

		const tbody = table.createEl('tbody');
		for (const row of HELP_ROWS) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', {
				cls: 'f2-batch-help-syntax',
				text: row.syntax,
			});
			tr.createEl('td', { text: t(row.meaningKey) });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
