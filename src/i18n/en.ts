/** English UI strings. */
export const en = {
	'common.cancel': 'Cancel',
	'common.confirm': 'Confirm',
	'common.remove': 'Remove',
	'common.dragToReorder': 'Drag to reorder',
	'common.file': 'file',

	'commands.renameFileOrEmbed': 'Rename file or embed',
	'commands.renameAndEditAllProperties': 'Rename and edit all properties',
	'commands.renameAttachments': 'Rename attachments',
	'commands.copyAndDelete': 'Copy and delete file',
	'menu.f2Rename': 'F2 Quick rename',

	'settings.tab.general': 'General',
	'settings.tab.features': 'Features',
	'settings.tab.properties': 'Properties',
	'settings.tab.attachments': 'Attachments',

	'notice.noOpenFile': 'No file is open',
	'notice.noEmbedToDelete':
		'No embedded file under the cursor. This command only deletes embeds, not the current note.',
	'notice.fullPropertiesMarkdownOnly':
		'Full properties panel is only supported for Markdown notes',
	'notice.attachmentsMarkdownOnly':
		'Attachment rename is only supported for Markdown notes',
	'notice.noAttachmentsFound': 'No matching attachments found in this note',
	'notice.attachmentRenameProgress':
		'Renaming attachments ({current}/{total})\nRenamed: {renamed} | Skipped: {skipped} | Failed: {failed}\n{status}',
	'notice.attachmentRenameDone':
		'Attachments done ({total}/{total})\nRenamed: {renamed} | Skipped: {skipped} | Failed: {failed}',
	'notice.cannotEditLinkNoEditor':
		'Cannot edit link: no editor available',
	'notice.cannotEditAliasNoEditor':
		'Cannot edit alias: no editor available',
	'notice.urlCannotBeEmpty': 'URL cannot be empty',
	'notice.urlEmpty': 'URL is empty',
	'notice.fileNotFound': 'File not found: {path}',
	'notice.writePropertiesFailed': 'Failed to write properties: {message}',
	'notice.companionRenameFailed': 'Companion rename failed: {name}',
	'notice.embedLinkNotLocated':
		'Could not locate embed link in the editor',
	'notice.duplicateListItem': 'An identical item already exists in the list',
	'notice.addPropertyUnsupported':
		'This panel does not support adding properties',

	'modal.editLink.title': 'Edit link',
	'modal.renameEmbedLink.title': 'Rename embed link',
	'modal.renameEmbeddedExcalidraw.title':
		'Rename embedded Excalidraw file',
	'modal.renameExcalidraw.title': 'Rename Excalidraw file',
	'modal.renameEmbeddedFile.title': 'Rename embedded {ext}',
	'modal.renameFile.title': 'Rename file',
	'modal.field.urlLabel': 'Link',
	'modal.field.filenameLabel': 'Filename',
	'modal.aliasLabel.title': 'Title',
	'modal.aliasLabel.alias': 'Alias',
	'modal.field.linkTitlePlaceholder': 'Link display title',
	'modal.field.aliasPlaceholder': 'Optional; display name after |',
	'modal.addProperty': 'Add property',
	'modal.section.properties': 'Properties',
	'modal.section.more': 'More',
	'modal.attachments.title': 'Rename attachments',
	'modal.attachments.currentName': 'Current',
	'modal.attachments.newName': 'New name',
	'modal.attachments.resetSuggestions': 'Reset suggestions',

	'tooltip.doubleClickToEdit': 'Double-click to edit',
	'tooltip.clickIconOpenDoubleClickEdit':
		'Click the icon to open; double-click to edit',
	'tooltip.clickToOpen': 'Click to open',
	'tooltip.doubleClickEditExtension': 'Double-click to edit extension',
	'tooltip.openTagSearch': 'Open tag search',
	'tooltip.openLink': 'Open link',
	'tooltip.openFile': 'Open file',
	'aria.openLabeled': 'Open {label}',

	'header.openFolder': 'Show in folder',
	'header.copyWiki': 'Copy wikilink',
	'header.fullProperties': 'All properties',
	'header.deleteFile': 'Copy and delete',
	'header.deleteConfirm.title': 'Delete this file?',
	'header.deleteConfirm.message':
		'The file will be moved to trash. Copyable types are copied to the clipboard first (Markdown without YAML).',
	'header.deleteConfirm.confirm': 'Delete',
	'notice.folderRevealUnavailable':
		'Show in folder is only available on desktop',
	'notice.copiedAndDeleted': 'Copied to clipboard and deleted',
	'notice.deletedFile': 'File deleted',
	'notice.deleteFailed': 'Failed to delete file',
	'notice.copiedWiki': 'Copied wikilink',
	'notice.copiedText': 'Copied',
	'notice.copyFailed': 'Copy failed',
	'notice.noRelatedFile': 'No related file',

	'propertyType.checkbox': 'Checkbox',
	'propertyType.date': 'Date',
	'propertyType.datetime': 'Date & time',
	'propertyType.list': 'List',
	'propertyType.number': 'Number',
	'propertyType.select': 'Select',
	'propertyType.text': 'Text',

	'properties.changeType': 'Change type',
	'properties.keyPlaceholder': 'Property name',
	'properties.deleteProperty': 'Delete property',
	'properties.noValuePlaceholder': 'No value',
	'properties.listAddPlaceholder': 'Type and press Enter to add',

	'settings.basic.heading': 'General',
	'settings.basic.locale.name': 'Language',
	'settings.basic.locale.desc':
		'Interface language for this plugin. “System default” follows Obsidian’s language. Reload the plugin (or Obsidian) to refresh command and context-menu titles.',
	'settings.basic.locale.system': 'System default',
	'settings.basic.locale.zhCN': '简体中文',
	'settings.basic.locale.en': 'English',
	'settings.basic.modalWidth.name': 'Panel width',
	'settings.basic.modalWidth.desc':
		'CSS lengths such as 40vw or 600px. Separate multiple with commas; the smallest wins (CSS min()). Example: 40vw, 720px',
	'settings.basic.modalMaxHeight.name': 'Panel max height',
	'settings.basic.modalMaxHeight.desc':
		'CSS lengths such as 90vh or 920px. Separate multiple with commas; the smallest wins. Example: 90vh, 920px',
	'settings.basic.resetSize': 'Reset to default',

	'settings.features.heading': 'Feature toggles',
	'settings.features.intro':
		'When turned off, the corresponding feature will not run.',
	'settings.features.renameEmbeds.name': 'Rename embedded files',
	'settings.features.renameEmbeds.desc':
		'When the cursor is on a wiki / Markdown embed, rename the embedded file instead of the current note.',
	'settings.features.editEmbedAlias.name': 'Edit embed alias',
	'settings.features.editEmbedAlias.desc':
		'When renaming an embed, show an alias field to edit the display name of ![[file|alias]] or ![alias](file).',
	'settings.features.renameHeadings.name': 'Rename heading',
	'settings.features.renameHeadings.desc':
		'When the selection or current line is a heading, use Obsidian’s built-in “Rename heading”.',
	'settings.features.renameCompanions.name': 'Also rename companion files',
	'settings.features.renameCompanions.desc':
		'Also rename files in the same folder that share the same stem with a different extension (for example note.md, note.canvas, and note.excalidraw.md).',
	'settings.features.copyNameToClipboard.name': 'Copy new name to clipboard',
	'settings.features.copyNameToClipboard.desc':
		'After renaming the active note, copy the new basename to the clipboard (not when renaming embeds).',
	'settings.features.editProperties.name': 'Edit document properties',
	'settings.features.editProperties.desc':
		'When renaming the current note or a recognized embedded Markdown document, edit configured frontmatter properties under “Properties”.',
	'settings.features.autoSaveProperties.name': 'Auto-save property edits',
	'settings.features.autoSaveProperties.desc':
		'Write property changes under “Properties” to the note immediately, without clicking Confirm. When off, properties are saved only after you click Confirm.',
	'settings.features.editExtension.name': 'Double-click to edit extension',
	'settings.features.editExtension.desc':
		'When enabled, double-click the extension after the filename in the rename panel to edit it (for example .md). Off by default.',
	'settings.features.showHeaderDelete.name': 'Delete button in rename panel',
	'settings.features.showHeaderDelete.desc':
		'Show a delete button in the rename panel header. After confirmation, copyable files are copied to the clipboard (Markdown without YAML) and the file is moved to trash.',
	'settings.features.confirmBeforeDelete.name': 'Confirm before delete',
	'settings.features.confirmBeforeDelete.desc':
		'Ask for confirmation before copy-and-delete (panel button and command). On by default.',
	'settings.features.copyOnDeleteTypes.name': 'Copy before delete — file types',
	'settings.features.copyOnDeleteTypes.desc':
		'Comma-separated extensions that are copied to the clipboard before delete. Example: md,txt,js,py',
	'settings.features.copyOnDeleteTypes.reset': 'Reset to default',

	'settings.attachments.heading': 'Attachment rename',
	'settings.attachments.intro':
		'Rename attachments linked or embedded in the current note. Reading mode or a blank line targets all matches; the cursor on an attachment targets that file only; a multi-line selection targets attachments inside the selection. Bind or change the hotkey under Settings → Hotkeys.',
	'settings.attachments.extensions.name': 'Attachment extensions',
	'settings.attachments.extensions.desc':
		'Comma-separated list (dots optional). Example: png,jpg,jpeg,avif,gif,webp,mp4,bmp,tif',
	'settings.attachments.template.name': 'Name template',
	'settings.attachments.template.desc':
		'Suggested basename. Available tokens:\n{ctime:format} — created time (moment format)\n{mtime:format} — modified time\n{name} — original basename\n{ext} — extension with dot\nExample: File-{ctime:YYYYMMDDhhmmssSSS}',
	'settings.attachments.delay.name': 'Batch rename delay (ms)',
	'settings.attachments.delay.desc':
		'Pause between each rename in a batch to avoid vault update races. Default 500.',
	'settings.attachments.silentMode.name': 'Silent mode',
	'settings.attachments.silentMode.desc':
		'When enabled, apply the name template automatically without a confirmation panel. Off by default.',
	'settings.attachments.reset': 'Reset to default',

	'settings.propertyFields.heading': 'Document properties',
	'settings.propertyFields.defaultCollapsed.name': 'Collapse by default',
	'settings.propertyFields.defaultCollapsed.desc':
		'When enabled, F2 hides configured properties until you click Properties. F5 full properties always stay expanded.',
	'settings.propertyFields.intro':
		'Configure properties editable under “Properties” in the rename panel. Drag to reorder; drop properties into a “Side-by-side group” to show them on one row. For lists or selects with “Suggest” enabled, existing vault values for that property appear as dropdown suggestions (select picks one value).',
	'settings.propertyFields.addProperty': 'Add property',
	'settings.propertyFields.addSeparator': 'Add separator',
	'settings.propertyFields.addRow': 'Add side-by-side group',
	'settings.propertyFields.resetDefaults': 'Reset to defaults',
	'settings.propertyFields.resetConfirm.title':
		'Reset document properties to defaults?',
	'settings.propertyFields.resetConfirm.message':
		'This clears the current property configuration (order, separators, and side-by-side groups) and restores the defaults title / aliases / tags. This cannot be undone.',
	'settings.propertyFields.resetConfirm.confirm': 'Reset',
	'settings.propertyFields.keyLabel': 'Property name',
	'settings.propertyFields.keyPlaceholder': 'Choose from vault or type',
	'settings.propertyFields.typeLabel': 'Type',
	'settings.propertyFields.aliasLabel': 'Alias',
	'settings.propertyFields.showHintLabel': 'Suggest',
	'settings.propertyFields.multilineLabel': 'Multiline',
	'settings.propertyFields.separatorBadge': 'Separator',
	'settings.propertyFields.separatorTitleLabel': 'Title (optional)',
	'settings.propertyFields.rowBadge': 'Side-by-side group',
	'settings.propertyFields.rowEmptyHint':
		'Drop properties here, or click “Add property”',
} as const;

export type TranslationKey = keyof typeof en;
