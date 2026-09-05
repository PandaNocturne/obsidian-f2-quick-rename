import type { TranslationKey } from './en';

/** Simplified Chinese UI strings. */
export const zhCN: Record<TranslationKey, string> = {
	'common.cancel': '取消',
	'common.confirm': '确认',
	'common.remove': '移除',
	'common.dragToReorder': '拖动排序',
	'common.file': '文件',

	'commands.renameFileOrEmbed': '重命名文件或嵌入',
	'commands.renameAndEditAllProperties': '重命名并编辑全部属性',
	'menu.f2Rename': 'F2 重命名',

	'notice.noOpenFile': '没有打开的文件',
	'notice.fullPropertiesMarkdownOnly': '仅支持 Markdown 笔记的全属性面板',
	'notice.cannotEditLinkNoEditor': '无法编辑链接：当前没有可用的编辑器',
	'notice.cannotEditAliasNoEditor': '无法编辑别名：当前没有可用的编辑器',
	'notice.urlCannotBeEmpty': 'URL 不能为空',
	'notice.urlEmpty': 'URL 为空',
	'notice.fileNotFound': '未找到文件: {path}',
	'notice.writePropertiesFailed': '写入属性失败: {message}',
	'notice.companionRenameFailed': '连带重命名失败: {name}',
	'notice.embedLinkNotLocated': '未能在编辑器中定位嵌入链接',
	'notice.duplicateListItem': '列表中已存在相同项',
	'notice.addPropertyUnsupported': '当前面板不支持添加属性',

	'modal.editLink.title': '编辑链接',
	'modal.renameEmbedLink.title': '重命名嵌入链接',
	'modal.renameEmbeddedExcalidraw.title': '重命名嵌入的 Excalidraw 文件',
	'modal.renameExcalidraw.title': '重命名 Excalidraw 文件',
	'modal.renameEmbeddedFile.title': '重命名嵌入的 {ext}',
	'modal.renameFile.title': '重命名文件',
	'modal.field.urlLabel': '链接',
	'modal.field.filenameLabel': '文件名',
	'modal.aliasLabel.title': '标题',
	'modal.aliasLabel.alias': '别名',
	'modal.field.linkTitlePlaceholder': '链接显示标题',
	'modal.field.aliasPlaceholder': '可选，对应 | 后的显示名',
	'modal.addProperty': '添加属性',
	'modal.section.properties': '属性',
	'modal.section.more': '更多',

	'tooltip.doubleClickToEdit': '双击编辑',
	'tooltip.clickIconOpenDoubleClickEdit': '点击图标打开，双击编辑',
	'tooltip.clickToOpen': '点击打开',
	'tooltip.doubleClickEditExtension': '双击修改扩展名',
	'tooltip.openTagSearch': '打开标签搜索',
	'tooltip.openLink': '打开链接',
	'tooltip.openFile': '打开文件',
	'aria.openLabeled': '打开{label}',

	'header.openFolder': '在文件夹中显示',
	'header.copyWiki': '复制 wiki',
	'header.fullProperties': '全部属性',
	'notice.folderRevealUnavailable': '仅桌面端可在文件夹中显示',
	'notice.copiedWiki': '已复制 wiki 链接',
	'notice.copiedText': '已复制',
	'notice.copyFailed': '复制失败',
	'notice.noRelatedFile': '没有关联文件',

	'propertyType.checkbox': '复选框',
	'propertyType.date': '日期',
	'propertyType.datetime': '日期 & 时间',
	'propertyType.list': '列表',
	'propertyType.number': '数字',
	'propertyType.select': '单选',
	'propertyType.text': '文本',

	'properties.changeType': '更改类型',
	'properties.keyPlaceholder': '属性名',
	'properties.deleteProperty': '删除属性',
	'properties.noValuePlaceholder': '没有值',
	'properties.listAddPlaceholder': '输入后回车添加',

	'settings.basic.heading': '基础设置',
	'settings.basic.locale.name': '界面语言',
	'settings.basic.locale.desc':
		'插件界面语言。「系统默认」跟随 Obsidian 语言。切换后命令与右键菜单标题需重载插件（或 Obsidian）才会更新。',
	'settings.basic.locale.system': '系统默认',
	'settings.basic.locale.zhCN': '简体中文',
	'settings.basic.locale.en': 'English',

	'settings.features.heading': '功能开关',
	'settings.features.intro': '关闭后对应功能不会触发。',
	'settings.features.renameEmbeds.name': '重命名嵌入文件',
	'settings.features.renameEmbeds.desc':
		'光标落在 wiki / Markdown 嵌入上时，重命名被嵌入的文件，而不是当前笔记。',
	'settings.features.editEmbedAlias.name': '编辑嵌入别名',
	'settings.features.editEmbedAlias.desc':
		'重命名嵌入时显示别名字段，可修改 ![[文件|别名]] 或 ![别名](文件) 的显示名。',
	'settings.features.renameHeadings.name': '重命名标题',
	'settings.features.renameHeadings.desc':
		'选中或光标所在行为标题时，调用 Obsidian 自带的「重命名标题」。',
	'settings.features.renameCompanions.name': '连带重命名同名文件',
	'settings.features.renameCompanions.desc':
		'同文件夹、同主文件名、不同扩展名的文件一并重命名（例如 note.md 与 note.canvas）。',
	'settings.features.copyNameToClipboard.name': '复制新名称到剪贴板',
	'settings.features.copyNameToClipboard.desc':
		'重命名当前打开的笔记后，将新主文件名写入剪贴板（重命名嵌入时不复制）。',
	'settings.features.editProperties.name': '编辑文档属性',
	'settings.features.editProperties.desc':
		'重命名当前笔记或可识别的嵌入 Markdown 文档时，在「属性」中编辑配置的 frontmatter 属性。',
	'settings.features.autoSaveProperties.name': '属性编辑自动保存',
	'settings.features.autoSaveProperties.desc':
		'在「属性」中修改属性后立即写入笔记，无需点击确认。关闭后需点击「确认」才会保存属性。',
	'settings.features.editExtension.name': '双击修改扩展名',
	'settings.features.editExtension.desc':
		'开启后，可在重命名面板中双击文件名后的扩展名进行编辑（例如 .md）。默认关闭。',

	'settings.propertyFields.heading': '文档属性',
	'settings.propertyFields.defaultCollapsed.name': '默认折叠',
	'settings.propertyFields.defaultCollapsed.desc':
		'开启后，F2 默认隐藏配置属性，需点击「属性」才显示。F5 全量属性始终展开。',
	'settings.propertyFields.intro':
		'配置重命名面板「属性」中可编辑的属性。拖动调整顺序；可将属性拖入「并排容器」使其在同一行显示。列表 / 单选开启「提示」后会从库中该属性已有值弹出下拉建议（单选为选一即填）。',
	'settings.propertyFields.addProperty': '添加属性',
	'settings.propertyFields.addSeparator': '添加分隔符',
	'settings.propertyFields.addRow': '添加并排容器',
	'settings.propertyFields.resetDefaults': '恢复默认',
	'settings.propertyFields.resetConfirm.title': '恢复默认文档属性？',
	'settings.propertyFields.resetConfirm.message':
		'将清除当前属性配置（含顺序、分隔符与并排容器），并恢复为默认的 title / aliases / tags。此操作不可撤销。',
	'settings.propertyFields.resetConfirm.confirm': '确认恢复',
	'settings.propertyFields.keyLabel': '属性名',
	'settings.propertyFields.keyPlaceholder': '从库中选择或输入',
	'settings.propertyFields.typeLabel': '类型',
	'settings.propertyFields.aliasLabel': '别名',
	'settings.propertyFields.showHintLabel': '提示',
	'settings.propertyFields.multilineLabel': '多行',
	'settings.propertyFields.separatorBadge': '分隔符',
	'settings.propertyFields.separatorTitleLabel': '标题（可选）',
	'settings.propertyFields.rowBadge': '并排容器',
	'settings.propertyFields.rowEmptyHint':
		'拖入属性到此处，或点击「添加属性」',
};
