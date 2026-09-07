import { App, TAbstractFile, TFile } from 'obsidian';

/**
 * Collect vault files currently multi-selected in a File Explorer leaf.
 * Uses internal explorer APIs with a DOM fallback (no public selection API).
 */
export function getFileExplorerSelectedFiles(app: App): TFile[] {
	const leaves = app.workspace.getLeavesOfType('file-explorer');
	for (const leaf of leaves) {
		const files = collectFromExplorerView(app, leaf.view);
		if (files.length > 0) return files;
	}
	return [];
}

/** True when the most recent leaf is a file explorer. */
export function isFileExplorerFocused(app: App): boolean {
	const leaf = app.workspace.getMostRecentLeaf();
	return leaf?.view?.getViewType?.() === 'file-explorer';
}

function collectFromExplorerView(app: App, view: unknown): TFile[] {
	const v = view as {
		tree?: { selectedDoms?: Iterable<unknown> | Set<unknown> };
		fileItems?: Record<
			string,
			{ file?: TAbstractFile; selfEl?: HTMLElement; el?: HTMLElement }
		>;
		containerEl?: HTMLElement;
	};

	const fromTree = collectFromSelectedDoms(v.tree?.selectedDoms);
	if (fromTree.length > 0) return fromTree;

	const fromItems = collectFromFileItems(v.fileItems);
	if (fromItems.length > 0) return fromItems;

	return collectFromDom(app, v.containerEl);
}

function collectFromSelectedDoms(
	selectedDoms: Iterable<unknown> | Set<unknown> | undefined,
): TFile[] {
	if (!selectedDoms) return [];
	const files: TFile[] = [];
	const seen = new Set<string>();
	for (const item of selectedDoms as Iterable<{ file?: TAbstractFile }>) {
		const file = item?.file;
		if (!(file instanceof TFile) || seen.has(file.path)) continue;
		seen.add(file.path);
		files.push(file);
	}
	return files;
}

function collectFromFileItems(
	fileItems:
		| Record<
				string,
				{ file?: TAbstractFile; selfEl?: HTMLElement; el?: HTMLElement }
		  >
		| undefined,
): TFile[] {
	if (!fileItems) return [];
	const files: TFile[] = [];
	const seen = new Set<string>();
	for (const item of Object.values(fileItems)) {
		const el = item.selfEl ?? item.el;
		if (!el?.classList?.contains('is-selected')) continue;
		const file = item.file;
		if (!(file instanceof TFile) || seen.has(file.path)) continue;
		seen.add(file.path);
		files.push(file);
	}
	return files;
}

function collectFromDom(
	app: App,
	containerEl: HTMLElement | undefined,
): TFile[] {
	if (!containerEl) return [];
	const files: TFile[] = [];
	const seen = new Set<string>();
	const nodes = containerEl.querySelectorAll(
		'.tree-item.is-selected [data-path], .nav-file.is-selected [data-path], .tree-item.is-selected[data-path], .nav-file.is-selected[data-path]',
	);
	for (const node of Array.from(nodes)) {
		const path = (node as HTMLElement).getAttribute('data-path');
		if (!path || seen.has(path)) continue;
		const abs = app.vault.getAbstractFileByPath(path);
		if (!(abs instanceof TFile)) continue;
		seen.add(path);
		files.push(abs);
	}
	return files;
}

/** Keep files only (ignore folders in a mixed selection). */
export function filterRenameableFiles(files: TAbstractFile[]): TFile[] {
	const out: TFile[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		if (!(file instanceof TFile) || seen.has(file.path)) continue;
		seen.add(file.path);
		out.push(file);
	}
	return out;
}
