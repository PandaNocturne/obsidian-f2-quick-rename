export interface F2RenameSettings {
	/** When the cursor is on a wiki/markdown embed, rename that file. */
	renameEmbeds: boolean;
	/**
	 * When renaming an embed link, also show/edit the display alias
	 * (`![[file|alias]]` / `![alias](file)`).
	 */
	editEmbedAlias: boolean;
	/** When the selection/line is a heading, use Obsidian's rename-heading. */
	renameHeadings: boolean;
	/** Also rename same-folder files that share the basename (different ext). */
	renameCompanions: boolean;
	/** After renaming the active note, copy the new basename to the clipboard. */
	copyNameToClipboard: boolean;
}

export const DEFAULT_SETTINGS: F2RenameSettings = {
	renameEmbeds: true,
	editEmbedAlias: true,
	renameHeadings: true,
	renameCompanions: true,
	copyNameToClipboard: true,
};
