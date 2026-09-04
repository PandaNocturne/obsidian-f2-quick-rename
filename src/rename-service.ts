import { App, Editor, Notice, TFile, normalizePath } from 'obsidian';
import type F2RenamePlugin from './main';
import { promptRename } from './ui/rename-prompt-modal';
import {
	isExcalidrawFile,
	matchSelectionEmbed,
	normalizeSpaces,
	resolveEmbedFile,
	stripExcalidrawBasename,
} from './utils/embed';

export class RenameService {
	constructor(private readonly plugin: F2RenamePlugin) {}

	private get app(): App {
		return this.plugin.app;
	}

	async run(): Promise<void> {
		const { settings } = this.plugin;
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice('没有打开的文件');
			return;
		}

		const { selection, editor } = this.getSelection();

		if (selection) {
			if (
				settings.renameHeadings &&
				/^#+\s/.test(selection.trim()) &&
				editor
			) {
				// `commands` exists at runtime; not always typed on App
				(
					this.app as App & {
						commands: { executeCommandById: (id: string) => boolean };
					}
				).commands.executeCommandById('editor:rename-heading');
				return;
			}

			if (settings.renameEmbeds) {
				const embed = matchSelectionEmbed(selection);
				if (embed) {
					const target = resolveEmbedFile(
						this.app,
						embed.linkpath,
						file.path,
					);
					if (target) {
						await this.renameTargetFile(target, true);
						return;
					}
					new Notice(`❌未找到文件: ${embed.linkpath}`);
				}
			}
		}

		await this.renameTargetFile(file, false);
	}

	private getSelection(): { selection: string; editor: Editor | null } {
		let selection = '';
		let editor: Editor | null = null;

		const activeEditor = this.app.workspace.activeEditor;
		if (activeEditor?.editor) {
			editor = activeEditor.editor;
			try {
				const selected = editor.getSelection();
				selection = selected
					? selected
					: editor.getLine(editor.getCursor().line);
			} catch {
				// Editor may be unavailable in some views
			}
		}

		if (!selection) {
			selection = window.getSelection()?.toString() ?? '';
		}

		return { selection, editor };
	}

	private async renameTargetFile(
		target: TFile,
		isEmbed: boolean,
	): Promise<void> {
		const { settings } = this.plugin;
		const excalidraw = isExcalidrawFile(target);
		const displayBase = excalidraw
			? stripExcalidrawBasename(target.basename)
			: target.basename;

		const kindLabel = this.describeFileKind(target, isEmbed, excalidraw);
		let newBase = await promptRename(this.app, kindLabel, displayBase);
		if (newBase === null) return;

		newBase = normalizeSpaces(newBase);
		if (!newBase) return;

		if (excalidraw) {
			newBase = `${newBase}.excalidraw`;
		}

		const parentPath = target.parent?.path ?? '';
		const newPath = normalizePath(
			parentPath
				? `${parentPath}/${newBase}.${target.extension}`
				: `${newBase}.${target.extension}`,
		);

		if (newPath === target.path) return;

		const companions = settings.renameCompanions
			? this.findCompanions(target)
			: [];

		if (!isEmbed && settings.copyNameToClipboard) {
			await navigator.clipboard.writeText(newBase).catch(() => undefined);
		}

		await this.app.fileManager.renameFile(target, newPath);

		for (const companion of companions) {
			const companionNewPath = normalizePath(
				parentPath
					? `${parentPath}/${newBase}.${companion.extension}`
					: `${newBase}.${companion.extension}`,
			);
			if (companionNewPath === companion.path) continue;
			try {
				await this.app.fileManager.renameFile(
					companion,
					companionNewPath,
				);
			} catch {
				new Notice(`连带重命名失败: ${companion.name}`);
			}
		}
	}

	private describeFileKind(
		file: TFile,
		isEmbed: boolean,
		excalidraw: boolean,
	): string {
		if (excalidraw) {
			return isEmbed
				? '🗳重命名嵌入的 Excalidraw 文件'
				: '🎨重命名 Excalidraw 文件';
		}
		if (isEmbed) {
			const ext = file.extension ? `.${file.extension}` : '';
			return `🗳重命名嵌入的 ${ext || '文件'}`;
		}
		return '📄重命名当前文档';
	}

	/**
	 * Same folder, same basename stem, different extension
	 * (e.g. `note.md` + `note.canvas`).
	 */
	private findCompanions(file: TFile): TFile[] {
		const parent = file.parent;
		if (!parent) return [];

		const stem = file.basename;
		return parent.children.filter(
			(child): child is TFile =>
				child instanceof TFile &&
				child.path !== file.path &&
				child.basename === stem,
		);
	}
}
