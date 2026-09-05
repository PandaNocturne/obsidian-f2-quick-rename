import { App, Editor, Notice, TFile, normalizePath } from 'obsidian';
import { t } from './i18n';
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
import type { PropertyFieldState, PropertyValue } from './settings';
import {
	buildFullPropertyStates,
	buildPropertyPanelItems,
	writeFullFrontmatter,
	writeMergedFrontmatter,
	writePropertyValues,
} from './utils/properties';

export class RenameService {
	constructor(private readonly plugin: F2RenamePlugin) {}

	private get app(): App {
		return this.plugin.app;
	}

	async run(): Promise<void> {
		const { settings } = this.plugin;
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice(t('notice.noOpenFile'));
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

	/** Rename a specific vault file (e.g. from the file explorer context menu). */
	async runForFile(file: TFile): Promise<void> {
		await this.renameTargetFile(file, false);
	}

	/**
	 * Open the F2 rename window with the full YAML properties panel expanded
	 * (add / edit / delete / reorder), bound to F5.
	 */
	async runFullProperties(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice(t('notice.noOpenFile'));
			return;
		}
		if (file.extension !== 'md') {
			new Notice(t('notice.fullPropertiesMarkdownOnly'));
			return;
		}
		await this.renameTargetFile(file, false, { fullProperties: true });
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
			new Notice(t('notice.cannotEditLinkNoEditor'));
			return;
		}

		const result = await promptRename(
			this.app,
			t('modal.editLink.title'),
			embed.linkpathRaw,
			{
				mode: 'url',
				showAlias: true,
				alias: embed.alias ?? '',
				aliasLabel: t('modal.aliasLabel.title'),
				sourcePath: this.app.workspace.getActiveFile()?.path ?? '',
			},
		);
		if (result === null) return;

		const newUrl = result.name.trim();
		const newTitle = normalizeSpaces(result.alias ?? '');
		if (!newUrl) {
			new Notice(t('notice.urlCannotBeEmpty'));
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
			: t('modal.renameEmbedLink.title');

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
			allowEditExtension: settings.editExtension,
			relatedFile: target,
			sourcePath:
				this.app.workspace.getActiveFile()?.path ?? target?.path ?? '',
			properties,
			propertiesOpen: !settings.propertiesDefaultCollapsed,
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
			new Notice(t('notice.cannotEditAliasNoEditor'));
		}

		if (!target) {
			if (!aliasChanged) {
				new Notice(t('notice.fileNotFound', { path: embed.linkpath }));
			}
			return;
		}

		if (!newBase) return;

		const parentPath = target.parent?.path ?? '';
		const { newPath, companionBase } = this.buildRenamePaths(
			target,
			newBase,
			result.extension,
			excalidraw,
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

		await this.applyFileRename(target, companionBase, newPath, parentPath);
	}

	private async renameTargetFile(
		target: TFile,
		isEmbed: boolean,
		options: { fullProperties?: boolean } = {},
	): Promise<void> {
		const { settings } = this.plugin;
		const excalidraw = isExcalidrawFile(target);
		const displayBase = excalidraw
			? stripExcalidrawBasename(target.basename)
			: target.basename;

		const wantProperties =
			target.extension === 'md' && settings.editProperties;
		const useFullList = Boolean(options.fullProperties) && wantProperties;
		const canEditProperties = wantProperties;
		const autoSaveProperties =
			canEditProperties && settings.autoSaveProperties;

		// F5: full YAML editor. F2: configured fields only (alias labels, no
		// rename/delete/reorder) via the classic “更多” panel.
		const fullPropertyFields = useFullList
			? buildFullPropertyStates(this.app, target)
			: undefined;
		const properties =
			wantProperties && !useFullList
				? buildPropertyPanelItems(
						this.app,
						target,
						settings.propertyFields,
					)
				: undefined;
		const managedKeys = (fullPropertyFields ?? []).map((field) => field.key);

		const trackManagedKeys = (fields: PropertyFieldState[]) => {
			for (const field of fields) {
				const key = field.key.trim();
				if (key && !managedKeys.includes(key)) {
					managedKeys.push(key);
				}
			}
		};

		const kindLabel = this.describeFileKind(target, isEmbed, excalidraw);
		const result = await promptRename(this.app, kindLabel, displayBase, {
			extension: displayExtensionSuffix(target, excalidraw),
			allowEditExtension: settings.editExtension,
			relatedFile: target,
			sourcePath: target.path,
			properties,
			fullProperties: fullPropertyFields,
			propertiesOpen:
				useFullList || !settings.propertiesDefaultCollapsed,
			autoSaveProperties,
			onPropertiesChange:
				autoSaveProperties && !useFullList
					? (values) => this.applyProperties(target, values)
					: undefined,
			onFullPropertiesChange:
				autoSaveProperties && useFullList
					? (fields, values) => {
							trackManagedKeys(fields);
							return this.applyPanelProperties(
								target,
								fields,
								values,
								managedKeys,
								false,
							);
						}
					: undefined,
		});
		if (result === null) return;

		const newBase = normalizeSpaces(result.name);
		if (!newBase) return;

		const parentPath = target.parent?.path ?? '';
		const { newPath, companionBase } = this.buildRenamePaths(
			target,
			newBase,
			result.extension,
			excalidraw,
		);

		const nameChanged = newPath !== target.path;

		if (
			result.properties &&
			canEditProperties &&
			!settings.autoSaveProperties
		) {
			if (useFullList) {
				const fields = result.fullPropertyFields ?? [];
				trackManagedKeys(fields);
				await this.applyPanelProperties(
					target,
					fields,
					result.properties,
					managedKeys,
					false,
				);
			} else {
				await this.applyProperties(target, result.properties);
			}
		}

		if (!nameChanged) return;

		if (!isEmbed && settings.copyNameToClipboard) {
			await navigator.clipboard.writeText(newBase).catch(() => undefined);
		}

		await this.applyFileRename(target, companionBase, newPath, parentPath);
	}

	/** Markdown notes whose frontmatter can be edited in the rename panel. */
	private canEditProperties(file: TFile | null): boolean {
		const { settings } = this.plugin;
		return Boolean(
			file && settings.editProperties && file.extension === 'md',
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
			new Notice(t('notice.writePropertiesFailed', { message }));
		}
	}

	private async applyPanelProperties(
		file: TFile,
		fields: PropertyFieldState[],
		values: Record<string, PropertyValue>,
		managedKeys: string[],
		mergeWrites: boolean,
	): Promise<void> {
		try {
			if (mergeWrites) {
				await writeMergedFrontmatter(
					this.app,
					file,
					fields,
					values,
					managedKeys,
				);
			} else {
				await writeFullFrontmatter(this.app, file, fields, values);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(t('notice.writePropertiesFailed', { message }));
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
				new Notice(
					t('notice.companionRenameFailed', { name: companion.name }),
				);
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
			new Notice(t('notice.embedLinkNotLocated'));
			return;
		}
		editor.replaceRange(
			next,
			{ line: lineNo, ch: at },
			{ line: lineNo, ch: at + raw.length },
		);
	}

	/**
	 * Build the target path from the editable stem + extension suffix.
	 * Companion renames use Obsidian's basename stem of the new leaf name.
	 */
	private buildRenamePaths(
		target: TFile,
		stem: string,
		extensionFromPrompt: string | undefined,
		excalidraw: boolean,
	): { newPath: string; companionBase: string } {
		const fallback = displayExtensionSuffix(target, excalidraw);
		let ext = (extensionFromPrompt ?? fallback).trim();
		if (ext && !ext.startsWith('.')) ext = `.${ext}`;
		if (!ext && target.extension) ext = `.${target.extension}`;

		const parentPath = target.parent?.path ?? '';
		const leaf = `${stem}${ext}`;
		const newPath = normalizePath(
			parentPath ? `${parentPath}/${leaf}` : leaf,
		);
		const companionBase = leaf.includes('.')
			? leaf.replace(/\.[^.]+$/, '')
			: leaf;
		return { newPath, companionBase };
	}

	private describeFileKind(
		file: TFile,
		isEmbed: boolean,
		excalidraw: boolean,
	): string {
		if (excalidraw) {
			return isEmbed
				? t('modal.renameEmbeddedExcalidraw.title')
				: t('modal.renameExcalidraw.title');
		}
		if (isEmbed) {
			const ext = file.extension ? `.${file.extension}` : t('common.file');
			return t('modal.renameEmbeddedFile.title', { ext });
		}
		return t('modal.renameFile.title');
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
