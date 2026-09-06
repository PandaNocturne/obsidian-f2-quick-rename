import { App, Modal, TFile, setIcon } from 'obsidian';
import { t } from '../i18n';
import {
	DEFAULT_MODAL_MAX_HEIGHT,
	DEFAULT_MODAL_WIDTH,
	toMinCssValue,
} from '../utils/css-size';
import { normalizeSpaces } from '../utils/embed';

export interface AttachmentRenameRow {
	file: TFile;
	/** Suggested basename without extension. */
	suggestedBasename: string;
}

export interface AttachmentRenameResultItem {
	file: TFile;
	newBasename: string;
}

/**
 * Batch editor: edit suggested basenames for multiple attachments, then confirm.
 */
export class AttachmentRenameModal extends Modal {
	private readonly rows: AttachmentRenameRow[];
	private readonly onSubmit: (
		value: AttachmentRenameResultItem[] | null,
	) => void;
	private readonly modalWidth: string;
	private readonly modalMaxHeight: string;
	private resolved = false;
	private inputs = new Map<string, HTMLInputElement>();

	constructor(
		app: App,
		rows: AttachmentRenameRow[],
		onSubmit: (value: AttachmentRenameResultItem[] | null) => void,
		opts: { modalWidth?: string; modalMaxHeight?: string } = {},
	) {
		super(app);
		this.rows = rows;
		this.onSubmit = onSubmit;
		this.modalWidth = opts.modalWidth ?? DEFAULT_MODAL_WIDTH;
		this.modalMaxHeight = opts.modalMaxHeight ?? DEFAULT_MODAL_MAX_HEIGHT;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('f2-rename-modal');
		this.modalEl.addClass('f2-attach-rename-modal');
		this.modalEl.style.setProperty(
			'--f2-rename-modal-width',
			toMinCssValue(this.modalWidth, DEFAULT_MODAL_WIDTH),
		);
		this.modalEl.style.setProperty(
			'--f2-rename-modal-max-height',
			toMinCssValue(this.modalMaxHeight, DEFAULT_MODAL_MAX_HEIGHT),
		);

		const header = contentEl.createDiv({ cls: 'f2-rename-header' });
		const iconWrap = header.createDiv({ cls: 'f2-rename-icon' });
		iconWrap.setAttr('data-file-kind', 'attachment');
		setIcon(iconWrap, 'paperclip');
		header.createEl('h2', {
			text: t('modal.attachments.title'),
			cls: 'f2-rename-title',
		});

		const body = contentEl.createDiv({ cls: 'f2-rename-body' });
		const list = body.createDiv({ cls: 'f2-attach-list' });

		for (const row of this.rows) {
			const item = list.createDiv({ cls: 'f2-attach-row' });
			const currentLabel = item.createDiv({ cls: 'f2-attach-current' });
			currentLabel.createSpan({
				cls: 'f2-attach-label',
				text: t('modal.attachments.currentName'),
			});
			currentLabel.createSpan({
				cls: 'f2-attach-current-name',
				text: row.file.name,
				attr: { title: row.file.path },
			});

			const field = item.createDiv({ cls: 'f2-attach-field' });
			field.createEl('label', {
				text: t('modal.attachments.newName'),
				cls: 'f2-attach-label',
			});
			const inputWrap = field.createDiv({ cls: 'f2-attach-input-wrap' });
			const input = inputWrap.createEl('input', {
				cls: 'f2-rename-input f2-attach-input',
				attr: {
					type: 'text',
					spellcheck: 'false',
					value: row.suggestedBasename,
				},
			});
			input.value = row.suggestedBasename;
			this.inputs.set(row.file.path, input);

			const ext = row.file.extension ? `.${row.file.extension}` : '';
			if (ext) {
				inputWrap.createSpan({
					cls: 'f2-rename-ext',
					text: ext,
				});
			}
		}

		const footer = contentEl.createDiv({ cls: 'f2-rename-footer' });
		const left = footer.createDiv({ cls: 'f2-rename-footer-left' });
		const right = footer.createDiv({ cls: 'f2-rename-footer-right' });

		const resetBtn = left.createEl('button', {
			text: t('modal.attachments.resetSuggestions'),
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		resetBtn.addEventListener('click', () => {
			for (const row of this.rows) {
				const input = this.inputs.get(row.file.path);
				if (input) input.value = row.suggestedBasename;
			}
		});

		const cancelBtn = right.createEl('button', {
			text: t('common.cancel'),
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		cancelBtn.addEventListener('click', () => this.submit(null));

		const confirmBtn = right.createEl('button', {
			text: t('common.confirm'),
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta',
			attr: { type: 'button' },
		});
		confirmBtn.addEventListener('click', () => this.submitResult());

		window.setTimeout(() => {
			const first = this.inputs.values().next().value as
				| HTMLInputElement
				| undefined;
			first?.focus();
			first?.select();
		}, 50);
	}

	onClose(): void {
		this.contentEl.empty();
		this.inputs.clear();
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
	}

	private submitResult(): void {
		const result: AttachmentRenameResultItem[] = [];
		for (const row of this.rows) {
			const input = this.inputs.get(row.file.path);
			const newBasename = normalizeSpaces(input?.value ?? '');
			if (!newBasename) continue;
			result.push({ file: row.file, newBasename });
		}
		this.submit(result);
	}

	private submit(value: AttachmentRenameResultItem[] | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.close();
		this.onSubmit(value);
	}
}

export function promptAttachmentBatchRename(
	app: App,
	rows: AttachmentRenameRow[],
	opts: { modalWidth?: string; modalMaxHeight?: string } = {},
): Promise<AttachmentRenameResultItem[] | null> {
	return new Promise((resolve) => {
		new AttachmentRenameModal(app, rows, resolve, opts).open();
	});
}
