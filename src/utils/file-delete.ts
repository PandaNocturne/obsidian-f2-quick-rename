import { App, Modal, TFile } from 'obsidian';
import { t } from '../i18n';
import { parseAttachmentExtensions } from './attachments';

export const DEFAULT_COPY_ON_DELETE_TYPES = 'md,txt,js,py';

/** Parse comma-separated extensions for copy-on-delete (same rules as attachments). */
export function parseCopyOnDeleteTypes(raw: string): string[] {
	return parseAttachmentExtensions(raw);
}

/** Strip leading YAML frontmatter from markdown (and leading blank lines). */
export function stripYamlFrontmatter(content: string): string {
	return content
		.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
		.replace(/^\r?\n+/, '');
}

export type CopyAndTrashResult =
	| 'copied-deleted'
	| 'deleted'
	| 'failed';

export function confirmDeleteFile(app: App): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText(t('header.deleteConfirm.title'));
		modal.contentEl.createEl('p', {
			text: t('header.deleteConfirm.message'),
		});
		const actions = modal.contentEl.createDiv({
			cls: 'modal-button-container',
		});
		const cancel = actions.createEl('button', {
			text: t('common.cancel'),
		});
		cancel.addEventListener('click', () => {
			modal.close();
			resolve(false);
		});
		const confirm = actions.createEl('button', {
			text: t('header.deleteConfirm.confirm'),
			cls: 'mod-warning',
		});
		confirm.addEventListener('click', () => {
			modal.close();
			resolve(true);
		});
		modal.open();
	});
}

/**
 * Optionally copy file text to the clipboard, then move the file to trash.
 * Text extensions from `copyTypes` are read; `.md` strips YAML first.
 */
export async function copyAndTrashFile(
	app: App,
	file: TFile,
	copyTypes: string[],
): Promise<CopyAndTrashResult> {
	const ext = file.extension.toLowerCase();
	let copied = false;

	if (copyTypes.includes(ext)) {
		try {
			const raw = await app.vault.read(file);
			const text =
				ext === 'md' ? stripYamlFrontmatter(raw) : raw;
			if (text.length > 0) {
				await navigator.clipboard.writeText(text);
				copied = true;
			}
		} catch (error) {
			console.error(`Failed to copy before delete: ${file.path}`, error);
		}
	}

	try {
		await app.fileManager.trashFile(file);
		return copied ? 'copied-deleted' : 'deleted';
	} catch (error) {
		console.error(`Failed to trash file: ${file.path}`, error);
		return 'failed';
	}
}
