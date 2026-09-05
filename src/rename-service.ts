import {
	App,
	Editor,
	MarkdownView,
	Notice,
	TFile,
	normalizePath,
} from 'obsidian';
import { t } from './i18n';
import type F2RenamePlugin from './main';
import { promptRename } from './ui/rename-prompt-modal';
import {
	type EmbedMatch,
	companionStem,
	companionStemFromLeaf,
	displayExtensionSuffix,
	fileExtensionSuffix,
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
		const file = this.resolveCommandTargetFile();
		if (!file) {
			new Notice(t('notice.noOpenFile'));
			return;
		}

		// Excalidraw hosts an interactive embed leaf/editor that can steal
		// activeEditor / getActiveFile. Always rename the host drawing file.
		// Canvas is excluded: card editors should still resolve embeds/links.
		if (this.isExcalidrawHostView()) {
			await this.renameTargetFile(file, false);
			return;
		}

		const { selection, hasExplicitSelection, editor, editorFile } =
			this.getSelection();

		// Reading (preview) mode: only honor an explicit selection for
		// heading / embed / link. Otherwise rename the current note.
		const readingMode = this.isMarkdownReadingMode();
		if (readingMode && !hasExplicitSelection) {
			await this.renameTargetFile(file, false);
			return;
		}

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

			// Prefer embeds/links from the same note. Allow an explicit
			// selection in Reading mode even when no CM editor is focused.
			const sameNote = !editorFile || editorFile.path === file.path;
			if (
				settings.renameEmbeds &&
				sameNote &&
				(editor || hasExplicitSelection)
			) {
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

			// Reading mode with a selection that is not heading/embed/link:
			// fall through to renaming the current note.
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
		const file = this.resolveCommandTargetFile();
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

	/**
	 * File owned by the active leaf's view. Prefer this over getActiveFile()
	 * so Excalidraw interactive embeds do not become the rename target.
	 * On Canvas, prefer the note being edited in a card when present.
	 */
	private resolveCommandTargetFile(): TFile | null {
		const leaf =
			this.app.workspace.activeLeaf ??
			this.app.workspace.getMostRecentLeaf();
		const view = leaf?.view as
			| { getViewType?: () => string; file?: TFile | null }
			| undefined;
		const viewType = view?.getViewType?.() ?? '';

		if (
			this.isExcalidrawHostViewType(viewType) &&
			view?.file instanceof TFile
		) {
			return view.file;
		}

		if (viewType === 'canvas') {
			const activeEditor = this.app.workspace.activeEditor;
			if (activeEditor?.file instanceof TFile) {
				return activeEditor.file;
			}
			if (view?.file instanceof TFile) {
				return view.file;
			}
		}

		return this.app.workspace.getActiveFile();
	}

	/** Excalidraw view that hosts interactive embeds (not Canvas). */
	private isExcalidrawHostView(): boolean {
		const leaf =
			this.app.workspace.activeLeaf ??
			this.app.workspace.getMostRecentLeaf();
		const viewType = leaf?.view?.getViewType?.() ?? '';
		return this.isExcalidrawHostViewType(viewType);
	}

	private isExcalidrawHostViewType(viewType: string): boolean {
		return (
			viewType === 'excalidraw' || viewType.startsWith('excalidraw')
		);
	}

	/** True when the active markdown leaf is in Reading (preview) mode. */
	private isMarkdownReadingMode(): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.getMode() === 'preview';
	}

	private getSelection(): {
		selection: string;
		/** True when the user selected text (not the current-line fallback). */
		hasExplicitSelection: boolean;
		editor: Editor | null;
		editorFile: TFile | null;
	} {
		let selection = '';
		let hasExplicitSelection = false;
		let editor: Editor | null = null;
		let editorFile: TFile | null = null;
		const readingMode = this.isMarkdownReadingMode();

		const activeEditor = this.app.workspace.activeEditor;
		if (activeEditor?.file instanceof TFile) {
			editorFile = activeEditor.file;
		}
		if (activeEditor?.editor) {
			editor = activeEditor.editor;
			try {
				const selected = editor.getSelection();
				if (selected) {
					selection = selected;
					hasExplicitSelection = true;
				} else if (!readingMode) {
					// Edit / Live Preview: use the line under the cursor.
					selection = editor.getLine(editor.getCursor().line);
				}
			} catch {
				// Editor may be unavailable in some views
			}
		}

		if (!selection) {
			const winSel = window.getSelection()?.toString() ?? '';
			if (winSel) {
				selection = winSel;
				hasExplicitSelection = true;
			}
		}

		return { selection, hasExplicitSelection, editor, editorFile };
	}

	private modalSizeOptions(): {
		modalWidth: string;
		modalMaxHeight: string;
	} {
		const { settings } = this.plugin;
		return {
			modalWidth: settings.modalWidth,
			modalMaxHeight: settings.modalMaxHeight,
		};
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
				...this.modalSizeOptions(),
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
			onFullPropertiesChange:
				autoSaveProperties && target
					? (fields, values) =>
							this.applyPanelProperties(
								target,
								fields,
								values,
								fields.map((field) => field.key.trim()).filter(Boolean),
								false,
							)
					: undefined,
			...this.modalSizeOptions(),
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
			if (result.fullPropertyFields) {
				await this.applyPanelProperties(
					target,
					result.fullPropertyFields,
					result.properties,
					result.fullPropertyFields
						.map((field) => field.key.trim())
						.filter(Boolean),
					false,
				);
			} else {
				await this.applyProperties(target, result.properties);
			}
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
		// rename/delete/reorder). Always pass configured items so the header
		// icon can toggle between F2 and F5 in the same dialog.
		const fullPropertyFields = useFullList
			? buildFullPropertyStates(this.app, target)
			: undefined;
		const properties = wantProperties
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
			onPropertiesChange: autoSaveProperties
				? (values) => this.applyProperties(target, values)
				: undefined,
			onFullPropertiesChange: autoSaveProperties
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
			...this.modalSizeOptions(),
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
			if (result.fullPropertyFields) {
				trackManagedKeys(result.fullPropertyFields);
				await this.applyPanelProperties(
					target,
					result.fullPropertyFields,
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
			const suffix = fileExtensionSuffix(companion);
			const companionNewPath = normalizePath(
				parentPath
					? `${parentPath}/${newBase}${suffix}`
					: `${newBase}${suffix}`,
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
	 * Companion renames use the shared stem (strips `.excalidraw.md` correctly).
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
		return { newPath, companionBase: companionStemFromLeaf(leaf) };
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
	 * Same folder, same companion stem, different full extension
	 * (e.g. `note.md` + `note.canvas` + `note.excalidraw.md`).
	 * Stem compare is case-insensitive; Excalidraw compound suffixes supported.
	 */
	private findCompanions(file: TFile): TFile[] {
		const parentPath = file.parent?.path ?? '';
		const stem = companionStem(file);
		if (!stem) return [];
		const stemKey = stem.toLowerCase();

		return this.app.vault.getFiles().filter((child) => {
			if (child.path === file.path) return false;
			if ((child.parent?.path ?? '') !== parentPath) return false;
			return companionStem(child).toLowerCase() === stemKey;
		});
	}
}
