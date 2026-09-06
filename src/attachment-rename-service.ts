import {
	App,
	Editor,
	MarkdownView,
	Notice,
	TFile,
} from 'obsidian';
import { t } from './i18n';
import type F2RenamePlugin from './main';
import { promptRename } from './ui/rename-prompt-modal';
import { promptAttachmentBatchRename } from './ui/attachment-rename-modal';
import {
	alreadyMatchesTemplate,
	buildSuggestedBasename,
	buildUniqueAttachmentPath,
	collectNoteAttachments,
	parseAttachmentExtensions,
	resolveAttachmentFromText,
} from './utils/attachments';
import { normalizeSpaces } from './utils/embed';

const sleep = (ms: number) =>
	new Promise<void>((resolve) => window.setTimeout(resolve, ms));

interface ProgressStats {
	total: number;
	renamed: number;
	skipped: number;
	failed: number;
	current: number;
}

export class AttachmentRenameService {
	constructor(private readonly plugin: F2RenamePlugin) {}

	private get app(): App {
		return this.plugin.app;
	}

	async run(): Promise<void> {
		const note = this.app.workspace.getActiveFile();
		if (!note) {
			new Notice(t('notice.noOpenFile'));
			return;
		}
		if (note.extension !== 'md') {
			new Notice(t('notice.attachmentsMarkdownOnly'));
			return;
		}

		const { settings } = this.plugin;
		const extensions = parseAttachmentExtensions(
			settings.attachmentExtensions,
		);
		const template =
			settings.attachmentNameTemplate.trim() ||
			'File-{ctime:YYYYMMDDhhmmssSSS}';

		const targets = this.resolveTargets(note, extensions);
		if (targets.length === 0) {
			new Notice(t('notice.noAttachmentsFound'));
			return;
		}

		if (targets.length === 1) {
			const only = targets[0];
			if (!only) {
				new Notice(t('notice.noAttachmentsFound'));
				return;
			}
			await this.renameSingle(only, template);
			return;
		}

		const rows = targets.map((file) => ({
			file,
			suggestedBasename: buildSuggestedBasename(file, template),
		}));

		const result = await promptAttachmentBatchRename(this.app, rows, {
			modalWidth: settings.modalWidth,
			modalMaxHeight: settings.modalMaxHeight,
		});
		if (!result || result.length === 0) return;

		await this.renameBatch(result, template, settings.attachmentRenameDelayMs);
	}

	/**
	 * Reading mode / blank line / no attachment under cursor → all.
	 * Cursor on an attachment line → that file only.
	 */
	private resolveTargets(note: TFile, extensions: string[]): TFile[] {
		if (this.isMarkdownReadingMode()) {
			return collectNoteAttachments(this.app, note, extensions);
		}

		const lineText = this.getActiveLineText();
		if (lineText === null || !lineText.trim()) {
			return collectNoteAttachments(this.app, note, extensions);
		}

		const current = resolveAttachmentFromText(
			this.app,
			lineText,
			note.path,
			extensions,
		);
		if (current) return [current];

		return collectNoteAttachments(this.app, note, extensions);
	}

	private isMarkdownReadingMode(): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.getMode() === 'preview';
	}

	/** Current editor line, or null when no editor. Empty string = blank line. */
	private getActiveLineText(): string | null {
		const activeEditor = this.app.workspace.activeEditor;
		const editor: Editor | null = activeEditor?.editor ?? null;
		if (!editor) {
			const winSel = window.getSelection()?.toString() ?? '';
			return winSel || null;
		}
		try {
			const selected = editor.getSelection();
			if (selected) return selected;
			return editor.getLine(editor.getCursor().line);
		} catch {
			return null;
		}
	}

	private async renameSingle(file: TFile, template: string): Promise<void> {
		const suggested = buildSuggestedBasename(file, template);
		const ext = file.extension ? `.${file.extension}` : '';
		const { settings } = this.plugin;

		const result = await promptRename(
			this.app,
			t('modal.attachments.title'),
			suggested,
			{
				extension: ext,
				allowEditExtension: false,
				relatedFile: file,
				sourcePath: this.app.workspace.getActiveFile()?.path ?? file.path,
				modalWidth: settings.modalWidth,
				modalMaxHeight: settings.modalMaxHeight,
			},
		);
		if (result === null) return;

		const newBasename = normalizeSpaces(result.name);
		if (!newBasename) return;

		await this.renameOne(file, newBasename);
	}

	private async renameBatch(
		items: { file: TFile; newBasename: string }[],
		template: string,
		delayMs: number,
	): Promise<void> {
		const stats: ProgressStats = {
			total: items.length,
			renamed: 0,
			skipped: 0,
			failed: 0,
			current: 0,
		};
		const notice = new Notice('', 0);
		const update = (status: string) => {
			notice.setMessage(
				t('notice.attachmentRenameProgress', {
					current: stats.current,
					total: stats.total,
					renamed: stats.renamed,
					skipped: stats.skipped,
					failed: stats.failed,
					status,
				}),
			);
		};

		update('');

		for (const item of items) {
			stats.current += 1;
			const { file, newBasename } = item;
			update(file.name);

			if (alreadyMatchesTemplate(file, template)) {
				const sameStem =
					normalizeSpaces(newBasename) ===
					buildSuggestedBasename(file, template);
				if (sameStem) {
					stats.skipped += 1;
					update(file.name);
					continue;
				}
			}

			const ok = await this.renameOne(file, newBasename);
			if (ok) stats.renamed += 1;
			else stats.failed += 1;

			if (delayMs > 0) await sleep(delayMs);
		}

		notice.setMessage(
			t('notice.attachmentRenameDone', {
				total: stats.total,
				renamed: stats.renamed,
				skipped: stats.skipped,
				failed: stats.failed,
			}),
		);
		window.setTimeout(() => notice.hide(), 5000);
	}

	/** @returns true when renamed (or already at target path). */
	private async renameOne(file: TFile, newBasename: string): Promise<boolean> {
		const stem = normalizeSpaces(newBasename);
		if (!stem) return false;

		const newPath = buildUniqueAttachmentPath(this.app, file, stem);
		if (newPath === file.path) return true;

		try {
			await this.app.fileManager.renameFile(file, newPath);
			return true;
		} catch (error) {
			console.error(`Attachment rename failed: ${file.path}`, error);
			return false;
		}
	}
}
