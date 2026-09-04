import { App, Editor, Notice, TFile, normalizePath } from 'obsidian';
import type F2RenamePlugin from './main';
import { promptRename } from './ui/rename-prompt-modal';
import {
	type EmbedMatch,
	displayExtensionSuffix,
	isExcalidrawFile,
	isWebUrl,
	linkpathDisplayBase,
	matchSelectionEmbed,
	normalizeSpaces,
	rebuildEmbed,
	resolveEmbedFile,
	stripExcalidrawBasename,
} from './utils/embed';
import {
	buildPropertyPanelItems,
	writePropertyValues,
} from './utils/properties';
import type { PropertyValue } from './settings';

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
					if (isWebUrl(embed.linkpath)) {
						await this.renameUrlLink(embed, editor);
						return;
					}
					const target = resolveEmbedFile(
						this.app,
						embed.linkpath,
						file.path,
					);
					await this.renameEmbed(target, embed, editor);
					return;
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

	private async renameUrlLink(
		embed: EmbedMatch,
		editor: Editor | null,
	): Promise<void> {
		if (!editor) {
			new Notice('无法编辑链接：当前没有可用的编辑器');
			return;
		}

		const result = await promptRename(
			this.app,
			'🔗编辑链接',
			embed.linkpathRaw,
			{
				mode: 'url',
				showAlias: true,
				alias: embed.alias ?? '',
				nameLabel: 'URL',
				aliasLabel: '标题',
			},
		);
		if (result === null) return;

		const newUrl = result.name.trim();
		const newTitle = normalizeSpaces(result.alias ?? '');
		if (!newUrl) {
			new Notice('URL 不能为空');
			return;
		}

		const rebuilt = rebuildEmbed(embed, {
			alias: newTitle.length > 0 ? newTitle : null,
			linkpathRaw: newUrl,
		});
		this.replaceEmbedText(editor, embed.raw, rebuilt);
	}

	private async renameEmbed(
		target: TFile | null,
		embed: EmbedMatch,
		editor: Editor | null,
	): Promise<void> {
		const { settings } = this.plugin;
		const showAlias = settings.editEmbedAlias;
		const excalidraw = target ? isExcalidrawFile(target) : false;
		const canEditProperties = this.canEditProperties(target);

		let displayBase: string;
		if (target) {
			displayBase = excalidraw
				? stripExcalidrawBasename(target.basename)
				: target.basename;
		} else {
			displayBase = linkpathDisplayBase(embed.linkpath);
		}

		const kindLabel = target
			? this.describeFileKind(target, true, excalidraw)
			: '🗳重命名嵌入链接';

		const properties =
			canEditProperties && target
				? buildPropertyPanelItems(
						this.app,
						target,
						settings.propertyFields,
					)
				: undefined;

		const autoSaveProperties =
			canEditProperties && settings.autoSaveProperties;

		const result = await promptRename(this.app, kindLabel, displayBase, {
			mode: 'file',
			showAlias,
			alias: embed.alias ?? '',
			extension: displayExtensionSuffix(
				target,
				excalidraw,
				embed.linkpath,
			),
			properties,
			autoSaveProperties,
			onPropertiesChange:
				autoSaveProperties && target
					? (values) => this.applyProperties(target, values)
					: undefined,
		});
		if (result === null) return;

		let newBase = normalizeSpaces(result.name);
		const newAlias = showAlias
			? normalizeSpaces(result.alias ?? '')
			: null;

		const aliasChanged =
			showAlias &&
			newAlias !== null &&
			newAlias !== (embed.alias ?? '').trim();

		if (aliasChanged && editor) {
			const rebuilt = rebuildEmbed(embed, {
				alias: newAlias.length > 0 ? newAlias : null,
			});
			this.replaceEmbedText(editor, embed.raw, rebuilt);
		} else if (aliasChanged && !editor) {
			new Notice('无法编辑别名：当前没有可用的编辑器');
		}

		if (!target) {
			if (!aliasChanged) {
				new Notice(`❌未找到文件: ${embed.linkpath}`);
			}
			return;
		}

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

		const nameChanged = newPath !== target.path;

		if (
			result.properties &&
			canEditProperties &&
			!settings.autoSaveProperties
		) {
			await this.applyProperties(target, result.properties);
		}

		if (!nameChanged) return;

		await this.applyFileRename(target, newBase, newPath, parentPath);
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

		const canEditProperties = this.canEditProperties(target);
		const properties = canEditProperties
			? buildPropertyPanelItems(
					this.app,
					target,
					settings.propertyFields,
				)
			: undefined;
		const autoSaveProperties =
			canEditProperties && settings.autoSaveProperties;

		const kindLabel = this.describeFileKind(target, isEmbed, excalidraw);
		const result = await promptRename(this.app, kindLabel, displayBase, {
			extension: displayExtensionSuffix(target, excalidraw),
			properties,
			autoSaveProperties,
			onPropertiesChange: autoSaveProperties
				? (values) => this.applyProperties(target, values)
				: undefined,
		});
		if (result === null) return;

		let newBase = normalizeSpaces(result.name);
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

		const nameChanged = newPath !== target.path;

		if (
			result.properties &&
			canEditProperties &&
			!settings.autoSaveProperties
		) {
			await this.applyProperties(target, result.properties);
		}

		if (!nameChanged) return;

		if (!isEmbed && settings.copyNameToClipboard) {
			await navigator.clipboard.writeText(newBase).catch(() => undefined);
		}

		await this.applyFileRename(target, newBase, newPath, parentPath);
	}

	/** Markdown notes whose frontmatter can be edited in the rename panel. */
	private canEditProperties(file: TFile | null): boolean {
		const { settings } = this.plugin;
		return Boolean(
			file &&
				settings.editProperties &&
				file.extension === 'md' &&
				settings.propertyFields.some(
					(item) => item.kind !== 'separator' && item.key.trim(),
				),
		);
	}

	private async applyProperties(
		file: TFile,
		values: Record<string, PropertyValue>,
	): Promise<void> {
		try {
			await writePropertyValues(
				this.app,
				file,
				this.plugin.settings.propertyFields,
				values,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`写入属性失败: ${message}`);
		}
	}

	private async applyFileRename(
		target: TFile,
		newBase: string,
		newPath: string,
		parentPath: string,
	): Promise<void> {
		const { settings } = this.plugin;
		const companions = settings.renameCompanions
			? this.findCompanions(target)
			: [];

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

	/**
	 * Replace the first occurrence of `raw` on the cursor line (or in the
	 * current selection when the selection itself contains the embed).
	 */
	private replaceEmbedText(
		editor: Editor,
		raw: string,
		next: string,
	): void {
		if (raw === next) return;

		const selected = editor.getSelection();
		if (selected && selected.includes(raw)) {
			const from = editor.getCursor('from');
			const to = editor.getCursor('to');
			editor.replaceRange(selected.replace(raw, next), from, to);
			return;
		}

		const lineNo = editor.getCursor().line;
		const line = editor.getLine(lineNo);
		const at = line.indexOf(raw);
		if (at < 0) {
			new Notice('未能在编辑器中定位嵌入链接');
			return;
		}
		editor.replaceRange(
			next,
			{ line: lineNo, ch: at },
			{ line: lineNo, ch: at + raw.length },
		);
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
