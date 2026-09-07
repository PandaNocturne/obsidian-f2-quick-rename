import { App, Modal, Notice, TFile, setIcon } from 'obsidian';
import { t } from '../i18n';
import {
	BATCH_PLACEHOLDERS,
	DEFAULT_BATCH_NAME_TEMPLATE,
	applyBatchProcessStep,
	previewFromWorkingNames,
	type BatchRenameMode,
	type BatchRenamePreview,
	type BatchTextCase,
} from '../utils/batch-rename';
import {
	DEFAULT_MODAL_MAX_HEIGHT,
	toMinCssValue,
} from '../utils/css-size';
import {
	renameFileKindIcon,
	resolveRenameFileKind,
} from '../utils/embed';

/** Wider than the single-file rename panel (list + rules). */
const DEFAULT_BATCH_MODAL_WIDTH = '92vw, 1100px';

export interface BatchRenameResultItem {
	file: TFile;
	newName: string;
}

/**
 * Batch rename panel:
 * - Left: step baseline → draft / committed new names
 * - Right: format / replace rules
 * - 下一步 commits draft as the next baseline and resets rule options
 * - 确认 executes vault renames from the working preview
 */
export class BatchRenameModal extends Modal {
	private files: TFile[];
	private readonly onSubmit: (
		value: BatchRenameResultItem[] | null,
	) => void;
	private readonly modalWidth: string;
	private readonly modalMaxHeight: string;

	private resolved = false;
	private mode: BatchRenameMode = 'format';
	private textCase: BatchTextCase = 'none';
	private template = DEFAULT_BATCH_NAME_TEMPLATE;
	private find = '';
	private replace = '';
	private useRegex = false;
	private removeNumbering = false;
	private spaceCjkLatin = false;
	/** Header sort: 0 = list order, 1 = A→Z, -1 = Z→A. */
	private nameSort: 0 | 1 | -1 = 0;
	private dragFromIndex: number | null = null;

	/** Committed baseline names for the current step (shown as 原名称). */
	private workingNames = new Map<string, string>();
	/** Snapshots before each 下一步, for undo. */
	private history: Array<Map<string, string>> = [];

	private batchTitleEl!: HTMLElement;
	private templateInput!: HTMLInputElement;
	private findInput!: HTMLInputElement;
	private replaceInput!: HTMLInputElement;
	private regexToggle!: HTMLInputElement;
	private formatPanel!: HTMLElement;
	private replacePanel!: HTMLElement;
	private previewBody!: HTMLElement;
	private countEl!: HTMLElement;
	private sortBtn!: HTMLButtonElement;
	private processBtn!: HTMLButtonElement;
	private confirmBtn!: HTMLButtonElement;
	private undoBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private modeButtons = new Map<BatchRenameMode, HTMLButtonElement>();
	private caseButtons = new Map<BatchTextCase, HTMLButtonElement>();
	private removeNumberingBtn!: HTMLButtonElement;
	private spaceCjkLatinBtn!: HTMLButtonElement;

	constructor(
		app: App,
		files: TFile[],
		onSubmit: (value: BatchRenameResultItem[] | null) => void,
		opts: { modalWidth?: string; modalMaxHeight?: string } = {},
	) {
		super(app);
		this.files = [...files];
		this.onSubmit = onSubmit;
		this.modalWidth = opts.modalWidth ?? DEFAULT_BATCH_MODAL_WIDTH;
		this.modalMaxHeight = opts.modalMaxHeight ?? DEFAULT_MODAL_MAX_HEIGHT;
		for (const file of this.files) {
			this.workingNames.set(file.path, file.name);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('f2-rename-modal');
		this.modalEl.addClass('f2-batch-rename-modal');
		this.modalEl.style.setProperty(
			'--f2-rename-modal-width',
			toMinCssValue(this.modalWidth, DEFAULT_BATCH_MODAL_WIDTH),
		);
		this.modalEl.style.setProperty(
			'--f2-rename-modal-max-height',
			toMinCssValue(this.modalMaxHeight, DEFAULT_MODAL_MAX_HEIGHT),
		);

		const header = contentEl.createDiv({ cls: 'f2-rename-header' });
		const iconWrap = header.createDiv({ cls: 'f2-rename-icon' });
		setIcon(iconWrap, 'folder-sync');
		this.batchTitleEl = header.createEl('h2', {
			text: t('modal.batch.title', { count: this.files.length }),
			cls: 'f2-rename-title',
		});

		const layout = contentEl.createDiv({ cls: 'f2-batch-layout' });
		this.renderPreview(layout.createDiv({ cls: 'f2-batch-preview' }));
		this.renderControls(layout.createDiv({ cls: 'f2-batch-controls' }));
		this.renderFooter(contentEl.createDiv({ cls: 'f2-batch-footer' }));

		this.renderPreviewRows();
		this.syncSortButton();
		this.syncActionState();

		window.setTimeout(() => {
			this.templateInput?.focus();
			this.templateInput?.select();
		}, 50);
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
	}

	private renderPreview(root: HTMLElement): void {
		const head = root.createDiv({ cls: 'f2-batch-preview-head' });
		head.createSpan({ cls: 'f2-batch-col-icon', text: '' });
		const oldHead = head.createDiv({ cls: 'f2-batch-col-old' });
		oldHead.createSpan({ text: t('modal.batch.originalName') });
		this.countEl = oldHead.createSpan({
			cls: 'f2-batch-count',
			text: `(${this.files.length}/${this.files.length})`,
		});
		this.sortBtn = oldHead.createEl('button', {
			cls: 'f2-batch-sort-btn',
			attr: {
				type: 'button',
				title: t('modal.batch.sortByName'),
				'aria-label': t('modal.batch.sortByName'),
			},
		});
		setIcon(this.sortBtn, 'arrow-up-down');
		this.sortBtn.addEventListener('click', () => this.cycleNameSort());

		head.createSpan({
			cls: 'f2-batch-col-arrow',
			text: '',
		});
		head.createSpan({
			cls: 'f2-batch-col-new',
			text: t('modal.batch.newName'),
		});
		head.createSpan({ cls: 'f2-batch-col-actions', text: '' });
		this.previewBody = root.createDiv({ cls: 'f2-batch-preview-body' });

		const listBar = root.createDiv({ cls: 'f2-batch-list-bar' });
		const listLeft = listBar.createDiv({ cls: 'f2-batch-list-bar-left' });
		this.clearBtn = listLeft.createEl('button', {
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		const clearIcon = this.clearBtn.createSpan({
			cls: 'f2-batch-btn-icon',
		});
		setIcon(clearIcon, 'trash-2');
		this.clearBtn.createSpan({ text: t('modal.batch.clearList') });
		this.clearBtn.addEventListener('click', () => this.clearList());

		const listRight = listBar.createDiv({ cls: 'f2-batch-list-bar-right' });
		this.undoBtn = listRight.createEl('button', {
			cls: 'f2-rename-btn',
			text: t('modal.batch.undoStep'),
			attr: { type: 'button' },
		});
		this.undoBtn.disabled = true;
		this.undoBtn.addEventListener('click', () => this.undoLastStep());
	}

	private renderControls(root: HTMLElement): void {
		const namingSection = root.createDiv({ cls: 'f2-batch-section' });
		const modeRow = namingSection.createDiv({ cls: 'f2-batch-field' });
		modeRow.createDiv({
			cls: 'f2-batch-label',
			text: t('modal.batch.namingMethod'),
		});
		const modeTabs = modeRow.createDiv({ cls: 'f2-batch-mode-tabs' });
		for (const mode of ['format', 'replace'] as const) {
			const btn = modeTabs.createEl('button', {
				cls: 'f2-batch-mode-tab',
				text:
					mode === 'format'
						? t('modal.batch.modeFormat')
						: t('modal.batch.modeReplace'),
				attr: {
					type: 'button',
					'aria-selected': mode === this.mode ? 'true' : 'false',
				},
			});
			if (mode === this.mode) btn.addClass('is-active');
			btn.addEventListener('click', () => this.setMode(mode));
			this.modeButtons.set(mode, btn);
		}

		this.formatPanel = namingSection.createDiv({
			cls: 'f2-batch-mode-panel is-active',
		});
		this.renderFormatPanel(this.formatPanel);

		this.replacePanel = namingSection.createDiv({
			cls: 'f2-batch-mode-panel',
		});
		this.renderReplacePanel(this.replacePanel);

		root.createDiv({ cls: 'f2-batch-section-divider' });

		const caseSection = root.createDiv({ cls: 'f2-batch-section' });
		const caseField = caseSection.createDiv({ cls: 'f2-batch-field' });
		caseField.createDiv({
			cls: 'f2-batch-label',
			text: t('modal.batch.textCase'),
		});
		const caseRow = caseField.createDiv({ cls: 'f2-batch-case-row' });
		const cases: Array<{
			id: BatchTextCase;
			label: string;
			titleKey:
				| 'modal.batch.case.none'
				| 'modal.batch.case.upper'
				| 'modal.batch.case.lower'
				| 'modal.batch.case.title';
		}> = [
			{ id: 'none', label: '—', titleKey: 'modal.batch.case.none' },
			{ id: 'upper', label: 'AG', titleKey: 'modal.batch.case.upper' },
			{ id: 'lower', label: 'ag', titleKey: 'modal.batch.case.lower' },
			{ id: 'title', label: 'Ag', titleKey: 'modal.batch.case.title' },
		];
		for (const item of cases) {
			const btn = caseRow.createEl('button', {
				cls: 'f2-batch-case-btn',
				text: item.label,
				attr: {
					type: 'button',
					title: t(item.titleKey),
					'aria-pressed': item.id === this.textCase ? 'true' : 'false',
				},
			});
			if (item.id === this.textCase) btn.addClass('is-active');
			btn.addEventListener('click', () => this.setTextCase(item.id));
			this.caseButtons.set(item.id, btn);
		}

		root.createDiv({ cls: 'f2-batch-section-divider' });

		const processSection = root.createDiv({ cls: 'f2-batch-section' });
		const processField = processSection.createDiv({ cls: 'f2-batch-field' });
		processField.createDiv({
			cls: 'f2-batch-label',
			text: t('modal.batch.textProcess'),
		});
		const processRow = processField.createDiv({
			cls: 'f2-batch-process-row',
		});

		const removeNumBtn = processRow.createEl('button', {
			cls: 'f2-batch-chip f2-batch-process-chip',
			text: t('modal.batch.removeNumbering'),
			attr: {
				type: 'button',
				title: t('modal.batch.removeNumberingHint'),
				'aria-pressed': this.removeNumbering ? 'true' : 'false',
			},
		});
		this.removeNumberingBtn = removeNumBtn;
		if (this.removeNumbering) removeNumBtn.addClass('is-active');
		removeNumBtn.addEventListener('click', () => {
			this.removeNumbering = !this.removeNumbering;
			removeNumBtn.toggleClass('is-active', this.removeNumbering);
			removeNumBtn.setAttr(
				'aria-pressed',
				this.removeNumbering ? 'true' : 'false',
			);
			this.onRuleChanged();
		});

		const spaceBtn = processRow.createEl('button', {
			cls: 'f2-batch-chip f2-batch-process-chip',
			text: t('modal.batch.spaceCjkLatin'),
			attr: {
				type: 'button',
				title: t('modal.batch.spaceCjkLatinHint'),
				'aria-pressed': this.spaceCjkLatin ? 'true' : 'false',
			},
		});
		this.spaceCjkLatinBtn = spaceBtn;
		if (this.spaceCjkLatin) spaceBtn.addClass('is-active');
		spaceBtn.addEventListener('click', () => {
			this.spaceCjkLatin = !this.spaceCjkLatin;
			spaceBtn.toggleClass('is-active', this.spaceCjkLatin);
			spaceBtn.setAttr(
				'aria-pressed',
				this.spaceCjkLatin ? 'true' : 'false',
			);
			this.onRuleChanged();
		});

		const actions = root.createDiv({ cls: 'f2-batch-controls-actions' });
		this.processBtn = actions.createEl('button', {
			text: t('modal.batch.nextStep'),
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta f2-batch-process',
			attr: { type: 'button' },
		});
		this.processBtn.addEventListener('click', () => this.applyNextStep());
	}

	private renderFooter(root: HTMLElement): void {
		const left = root.createDiv({ cls: 'f2-batch-footer-left' });
		const cancelBtn = left.createEl('button', {
			text: t('common.cancel'),
			cls: 'f2-rename-btn',
			attr: { type: 'button' },
		});
		cancelBtn.addEventListener('click', () => this.finish(null));

		const right = root.createDiv({ cls: 'f2-batch-footer-right' });
		this.confirmBtn = right.createEl('button', {
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta f2-batch-confirm',
			attr: { type: 'button' },
		});
		const confirmIcon = this.confirmBtn.createSpan({
			cls: 'f2-batch-confirm-icon',
		});
		setIcon(confirmIcon, 'check');
		this.confirmBtn.createSpan({ text: t('modal.batch.confirm') });
		this.confirmBtn.addEventListener('click', () => this.submitResult());
	}

	private renderFormatPanel(panel: HTMLElement): void {
		const field = panel.createDiv({ cls: 'f2-batch-field' });
		field.createDiv({
			cls: 'f2-batch-label',
			text: t('modal.batch.nameLabel'),
		});
		this.templateInput = field.createEl('input', {
			cls: 'f2-rename-input f2-batch-input',
			attr: {
				type: 'text',
				spellcheck: 'false',
				placeholder: DEFAULT_BATCH_NAME_TEMPLATE,
			},
		});
		this.templateInput.value = this.template;
		this.templateInput.addEventListener('input', () => {
			this.template = this.templateInput.value;
			this.onRuleChanged();
		});
		this.templateInput.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.applyNextStep();
			}
		});

		const chips = field.createDiv({ cls: 'f2-batch-chips' });
		for (const item of BATCH_PLACEHOLDERS) {
			const labelKey =
				item.labelKey === 'name'
					? 'modal.batch.placeholder.name'
					: item.labelKey === 'ext'
						? 'modal.batch.placeholder.ext'
						: item.labelKey === 'index'
							? 'modal.batch.placeholder.index'
							: 'modal.batch.placeholder.date';
			const chip = chips.createEl('button', {
				cls: 'f2-batch-chip',
				text: t(labelKey),
				attr: { type: 'button', title: item.token },
			});
			chip.addEventListener('click', () =>
				this.insertToken(this.templateInput, item.token, (v) => {
					this.template = v;
					this.onRuleChanged();
				}),
			);
		}
	}

	private renderReplacePanel(panel: HTMLElement): void {
		const findField = panel.createDiv({ cls: 'f2-batch-field' });
		findField.createDiv({
			cls: 'f2-batch-label',
			text: t('modal.batch.findLabel'),
		});
		this.findInput = findField.createEl('input', {
			cls: 'f2-rename-input f2-batch-input',
			attr: {
				type: 'text',
				spellcheck: 'false',
				placeholder: t('modal.batch.findPlaceholder'),
			},
		});
		this.findInput.addEventListener('input', () => {
			this.find = this.findInput.value;
			this.onRuleChanged();
		});

		const replaceField = panel.createDiv({ cls: 'f2-batch-field' });
		replaceField.createDiv({
			cls: 'f2-batch-label',
			text: t('modal.batch.replaceLabel'),
		});
		this.replaceInput = replaceField.createEl('input', {
			cls: 'f2-rename-input f2-batch-input',
			attr: {
				type: 'text',
				spellcheck: 'false',
				placeholder: t('modal.batch.replacePlaceholder'),
			},
		});
		this.replaceInput.addEventListener('input', () => {
			this.replace = this.replaceInput.value;
			this.onRuleChanged();
		});
		this.replaceInput.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.applyNextStep();
			}
		});

		const regexRow = panel.createDiv({ cls: 'f2-batch-check-row' });
		const regexLabel = regexRow.createEl('label', {
			cls: 'f2-batch-check-label',
		});
		this.regexToggle = regexLabel.createEl('input', {
			attr: { type: 'checkbox' },
		});
		this.regexToggle.checked = this.useRegex;
		this.regexToggle.addEventListener('change', () => {
			this.useRegex = this.regexToggle.checked;
			this.findInput.setAttr(
				'placeholder',
				this.useRegex
					? t('modal.batch.findRegexPlaceholder')
					: t('modal.batch.findPlaceholder'),
			);
			this.replaceInput.setAttr(
				'placeholder',
				this.useRegex
					? t('modal.batch.replaceRegexPlaceholder')
					: t('modal.batch.replacePlaceholder'),
			);
			this.onRuleChanged();
		});
		regexLabel.createSpan({ text: t('modal.batch.useRegex') });

		panel.createDiv({
			cls: 'f2-batch-hint',
			text: t('modal.batch.replaceHint'),
		});
	}

	private setMode(mode: BatchRenameMode): void {
		if (this.mode === mode) return;
		this.mode = mode;
		for (const [id, btn] of this.modeButtons) {
			btn.toggleClass('is-active', id === mode);
			btn.setAttr('aria-selected', id === mode ? 'true' : 'false');
		}
		this.formatPanel.toggleClass('is-active', mode === 'format');
		this.replacePanel.toggleClass('is-active', mode === 'replace');
		this.onRuleChanged();
		window.setTimeout(() => {
			if (mode === 'format') {
				this.templateInput.focus();
				this.templateInput.select();
			} else {
				this.findInput.focus();
				this.findInput.select();
			}
		}, 0);
	}

	private setTextCase(mode: BatchTextCase): void {
		this.textCase = mode;
		for (const [id, btn] of this.caseButtons) {
			btn.toggleClass('is-active', id === mode);
			btn.setAttr('aria-pressed', id === mode ? 'true' : 'false');
		}
		this.onRuleChanged();
	}

	private insertToken(
		input: HTMLInputElement,
		token: string,
		sync: (value: string) => void,
	): void {
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;
		const next =
			input.value.slice(0, start) + token + input.value.slice(end);
		input.value = next;
		sync(next);
		const caret = start + token.length;
		input.focus();
		input.setSelectionRange(caret, caret);
	}

	private getStepOptions() {
		return {
			template: this.template,
			find: this.find,
			replace: this.replace,
			useRegex: this.useRegex,
			textCase: this.textCase,
			textProcess: {
				removeNumbering: this.removeNumbering,
				spaceCjkLatin: this.spaceCjkLatin,
			},
		};
	}

	/** Live draft: current rules applied on top of committed working names. */
	private computeDraftNames(): {
		names: Map<string, string>;
		error?: 'invalid-regex';
	} {
		return applyBatchProcessStep(
			this.files,
			this.workingNames,
			this.mode,
			this.getStepOptions(),
		);
	}

	private refreshPreview(): void {
		this.renderPreviewRows();
		this.syncActionState();
	}

	/** Rule edits always update the live preview. */
	private onRuleChanged(): void {
		this.refreshPreview();
	}

	/** Commit the live draft as the next baseline step, then reset rule options. */
	private applyNextStep(): void {
		const draft = this.computeDraftNames();
		if (draft.error === 'invalid-regex') {
			new Notice(t('notice.batchInvalidRegex'));
			return;
		}

		let changed = false;
		for (const file of this.files) {
			const before = this.workingNames.get(file.path) ?? file.name;
			const after = draft.names.get(file.path) ?? file.name;
			if (before !== after) {
				changed = true;
				break;
			}
		}
		if (!changed) return;

		this.history.push(new Map(this.workingNames));
		this.workingNames = draft.names;
		this.resetRuleOptions();
		this.refreshPreview();
	}

	/** Restore naming / text options to defaults for the next step. */
	private resetRuleOptions(): void {
		this.mode = 'format';
		this.template = DEFAULT_BATCH_NAME_TEMPLATE;
		this.find = '';
		this.replace = '';
		this.useRegex = false;
		this.textCase = 'none';
		this.removeNumbering = false;
		this.spaceCjkLatin = false;

		for (const [id, btn] of this.modeButtons) {
			btn.toggleClass('is-active', id === 'format');
			btn.setAttr('aria-selected', id === 'format' ? 'true' : 'false');
		}
		this.formatPanel.toggleClass('is-active', true);
		this.replacePanel.toggleClass('is-active', false);

		if (this.templateInput) {
			this.templateInput.value = this.template;
		}
		if (this.findInput) this.findInput.value = '';
		if (this.replaceInput) this.replaceInput.value = '';
		if (this.regexToggle) {
			this.regexToggle.checked = false;
			this.findInput?.setAttr(
				'placeholder',
				t('modal.batch.findPlaceholder'),
			);
			this.replaceInput?.setAttr(
				'placeholder',
				t('modal.batch.replacePlaceholder'),
			);
		}

		for (const [id, btn] of this.caseButtons) {
			btn.toggleClass('is-active', id === 'none');
			btn.setAttr('aria-pressed', id === 'none' ? 'true' : 'false');
		}

		this.removeNumberingBtn?.toggleClass('is-active', false);
		this.removeNumberingBtn?.setAttr('aria-pressed', 'false');
		this.spaceCjkLatinBtn?.toggleClass('is-active', false);
		this.spaceCjkLatinBtn?.setAttr('aria-pressed', 'false');
	}

	private undoLastStep(): void {
		const prev = this.history.pop();
		if (!prev) return;
		this.workingNames = prev;
		this.refreshPreview();
	}

	private computePreviews(): BatchRenamePreview[] {
		const draft = this.computeDraftNames();
		const names = draft.error ? this.workingNames : draft.names;
		return previewFromWorkingNames(this.app, this.files, names);
	}

	private updateTitle(): void {
		this.batchTitleEl.setText(
			t('modal.batch.title', { count: this.files.length }),
		);
	}

	private removeFileAt(index: number): void {
		const file = this.files[index];
		if (!file) return;
		this.files.splice(index, 1);
		this.workingNames.delete(file.path);
		for (const snap of this.history) {
			snap.delete(file.path);
		}
		this.nameSort = 0;
		this.syncSortButton();
		this.updateTitle();
		this.renderPreviewRows();
		this.syncActionState();
	}

	private clearList(): void {
		this.files = [];
		this.workingNames.clear();
		this.history = [];
		this.nameSort = 0;
		this.syncSortButton();
		this.updateTitle();
		this.renderPreviewRows();
		this.syncActionState();
	}

	private cycleNameSort(): void {
		this.nameSort =
			this.nameSort === 0 ? 1 : this.nameSort === 1 ? -1 : 0;
		if (this.nameSort !== 0) {
			const dir = this.nameSort;
			this.files.sort((a, b) => dir * a.name.localeCompare(b.name));
		}
		this.syncSortButton();
		this.renderPreviewRows();
	}

	private syncSortButton(): void {
		this.sortBtn.toggleClass('is-active', this.nameSort !== 0);
		this.sortBtn.setAttr(
			'title',
			this.nameSort === 1
				? t('modal.batch.sortAsc')
				: this.nameSort === -1
					? t('modal.batch.sortDesc')
					: t('modal.batch.sortByName'),
		);
		this.sortBtn.empty();
		setIcon(
			this.sortBtn,
			this.nameSort === 1
				? 'arrow-down'
				: this.nameSort === -1
					? 'arrow-up'
					: 'arrow-up-down',
		);
	}

	private moveFile(from: number, to: number): void {
		if (
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= this.files.length ||
			to >= this.files.length
		) {
			return;
		}
		const [item] = this.files.splice(from, 1);
		if (!item) return;
		this.files.splice(to, 0, item);
		this.nameSort = 0;
		this.syncSortButton();
		this.renderPreviewRows();
	}

	private renderPreviewRows(): void {
		const previews = this.computePreviews();
		this.previewBody.empty();

		if (this.files.length === 0) {
			this.previewBody.createDiv({
				cls: 'f2-batch-empty',
				text: t('modal.batch.emptyList'),
			});
			this.countEl.setText('(0/0)');
			return;
		}

		let vaultChangeCount = 0;
		previews.forEach((row, index) => {
			if (row.changed && !row.error) vaultChangeCount += 1;

			const baseline =
				this.workingNames.get(row.file.path) ?? row.file.name;
			const stepChanged = !row.error && row.newName !== baseline;

			const el = this.previewBody.createDiv({
				cls: 'f2-batch-preview-row',
				attr: { draggable: 'true', 'data-index': String(index) },
			});
			if (row.error) el.addClass('is-error');
			else if (stepChanged) el.addClass('is-changed');

			el.addEventListener('dragstart', (evt) => {
				this.dragFromIndex = index;
				el.addClass('is-dragging');
				evt.dataTransfer?.setData('text/plain', String(index));
				if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'move';
			});
			el.addEventListener('dragend', () => {
				this.dragFromIndex = null;
				el.removeClass('is-dragging');
				this.previewBody
					.querySelectorAll('.is-drag-over')
					.forEach((node) => node.removeClass('is-drag-over'));
			});
			el.addEventListener('dragover', (evt) => {
				evt.preventDefault();
				if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
				el.addClass('is-drag-over');
			});
			el.addEventListener('dragleave', () => {
				el.removeClass('is-drag-over');
			});
			el.addEventListener('drop', (evt) => {
				evt.preventDefault();
				el.removeClass('is-drag-over');
				const from =
					this.dragFromIndex ??
					Number(evt.dataTransfer?.getData('text/plain'));
				if (!Number.isFinite(from)) return;
				this.moveFile(from, index);
			});

			const icon = el.createDiv({ cls: 'f2-batch-col-icon' });
			setIcon(icon, renameFileKindIcon(resolveRenameFileKind(row.file)));

			el.createDiv({
				cls: 'f2-batch-col-old',
				text: baseline,
				attr: { title: row.file.path },
			});

			el.createDiv({ cls: 'f2-batch-col-arrow', text: '→' });

			const newCol = el.createDiv({ cls: 'f2-batch-col-new' });
			if (row.error === 'empty') {
				newCol.setText(t('modal.batch.errorEmpty'));
			} else if (row.error === 'invalid') {
				newCol.setText(t('modal.batch.errorInvalid'));
			} else if (row.error === 'collision') {
				newCol.setText(
					t('modal.batch.errorCollision', { name: row.newName }),
				);
			} else {
				newCol.setText(row.newName);
			}

			const actions = el.createDiv({ cls: 'f2-batch-col-actions' });
			const delBtn = actions.createEl('button', {
				cls: 'f2-batch-row-btn f2-batch-delete-btn',
				attr: {
					type: 'button',
					title: t('modal.batch.removeItem'),
					'aria-label': t('modal.batch.removeItem'),
				},
			});
			setIcon(delBtn, 'trash-2');
			delBtn.addEventListener('click', (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				this.removeFileAt(index);
			});
			// Don't start a drag when clicking delete.
			delBtn.addEventListener('mousedown', (evt) => {
				evt.stopPropagation();
			});
		});

		this.countEl.setText(`(${vaultChangeCount}/${this.files.length})`);
	}

	private syncActionState(): void {
		const previews = this.computePreviews();
		const hasError = previews.some((row) => row.error);
		const changeCount = previews.filter(
			(row) => row.changed && !row.error,
		).length;
		const empty = this.files.length === 0;

		this.undoBtn.disabled = this.history.length === 0;
		this.undoBtn.toggleClass('is-disabled', this.history.length === 0);

		this.clearBtn.disabled = empty;
		this.clearBtn.toggleClass('is-disabled', empty);

		this.processBtn.disabled = empty;
		this.processBtn.toggleClass('is-disabled', empty);

		this.confirmBtn.disabled = empty || hasError || changeCount === 0;
		this.confirmBtn.toggleClass(
			'is-disabled',
			empty || hasError || changeCount === 0,
		);
	}

	private submitResult(): void {
		const previews = this.computePreviews();
		if (previews.some((row) => row.error)) return;
		const items = previews
			.filter((row) => row.changed)
			.map((row) => ({ file: row.file, newName: row.newName }));
		if (items.length === 0) return;
		this.finish(items);
	}

	private finish(value: BatchRenameResultItem[] | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.onSubmit(value);
		this.close();
	}
}

export function promptBatchRename(
	app: App,
	files: TFile[],
	opts: { modalWidth?: string; modalMaxHeight?: string } = {},
): Promise<BatchRenameResultItem[] | null> {
	return new Promise((resolve) => {
		new BatchRenameModal(app, files, resolve, opts).open();
	});
}
