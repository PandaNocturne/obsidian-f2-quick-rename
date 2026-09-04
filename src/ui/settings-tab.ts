import { App, Modal, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type F2RenamePlugin from '../main';
import {
	DEFAULT_PROPERTY_FIELDS,
	PROPERTY_TYPE_OPTIONS,
	clonePropertySettingsItem,
	isPropertyField,
	isPropertyRow,
	type F2RenameSettings,
	type PropertyFieldConfig,
	type PropertyFieldType,
	type PropertyRowConfig,
	type PropertySettingsItem,
} from '../settings';
import {
	PropertyKeySuggest,
	resolvePropertyFieldType,
} from './tag-suggest';

class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly heading: string,
		private readonly message: string,
		private readonly confirmText: string,
		private readonly onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.heading });
		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('取消').onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText(this.confirmText)
					.setWarning()
					.onClick(() => {
						this.close();
						void this.onConfirm();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
type ToggleKey = {
	[K in keyof F2RenameSettings]: F2RenameSettings[K] extends boolean
		? K
		: never;
}[keyof F2RenameSettings];

interface ToggleOption {
	key: ToggleKey;
	name: string;
	desc: string;
}

/** Drag payload for nested property settings list. */
type DragPath =
	| { scope: 'root'; index: number }
	| { scope: 'row'; rowIndex: number; index: number };

const TOGGLE_OPTIONS: ToggleOption[] = [
	{
		key: 'renameEmbeds',
		name: '重命名嵌入文件',
		desc: '光标落在 wiki / Markdown 嵌入上时，重命名被嵌入的文件，而不是当前笔记。',
	},
	{
		key: 'editEmbedAlias',
		name: '编辑嵌入别名',
		desc: '重命名嵌入时显示别名字段，可修改 ![[文件|别名]] 或 ![别名](文件) 的显示名。',
	},
	{
		key: 'renameHeadings',
		name: '重命名标题',
		desc: '选中或光标所在行为标题时，调用 Obsidian 自带的「重命名标题」。',
	},
	{
		key: 'renameCompanions',
		name: '连带重命名同名文件',
		desc: '同文件夹、同主文件名、不同扩展名的文件一并重命名（例如 note.md 与 note.canvas）。',
	},
	{
		key: 'copyNameToClipboard',
		name: '复制新名称到剪贴板',
		desc: '重命名当前打开的笔记后，将新主文件名写入剪贴板（重命名嵌入时不复制）。',
	},
	{
		key: 'editProperties',
		name: '编辑文档属性',
		desc: '重命名当前笔记或可识别的嵌入 Markdown 文档时，在「更多」中编辑配置的 frontmatter 属性。',
	},
	{
		key: 'autoSaveProperties',
		name: '属性编辑自动保存',
		desc: '在「更多」中修改属性后立即写入笔记，无需点击确认。关闭后需点击「重命名」才会保存属性。',
	},
];

const DRAG_MIME = 'application/x-f2-rename-property';

export class F2RenameSettingTab extends PluginSettingTab {
	plugin: F2RenamePlugin;
	private dragPath: DragPath | null = null;

	constructor(app: App, plugin: F2RenamePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.dragPath = null;

		new Setting(containerEl).setName('功能开关').setHeading();

		containerEl.createEl('p', {
			text: '关闭后对应功能不会触发。',
			cls: 'setting-item-description',
		});

		for (const option of TOGGLE_OPTIONS) {
			new Setting(containerEl)
				.setName(option.name)
				.setDesc(option.desc)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[option.key])
						.onChange(async (value) => {
							this.plugin.settings[option.key] = value;
							await this.plugin.saveSettings();
						}),
				);
		}

		this.renderPropertyFieldsSection(containerEl);
	}

	private renderPropertyFieldsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('文档属性').setHeading();

		containerEl.createEl('p', {
			text: '配置重命名面板「更多」中可编辑的属性。拖动调整顺序；可将属性拖入「并排容器」使其在同一行显示。列表开启「提示」后会从库中该属性已有值弹出下拉建议。',
			cls: 'setting-item-description',
		});

		const listEl = containerEl.createDiv({
			cls: 'f2-rename-setting-property-list',
		});

		const items = this.plugin.settings.propertyFields;
		items.forEach((item, index) => {
			if (item.kind === 'separator') {
				this.renderSeparatorRow(listEl, item, { scope: 'root', index });
			} else if (item.kind === 'row') {
				this.renderRowContainer(listEl, item, index);
			} else {
				this.renderFieldRow(listEl, item, { scope: 'root', index });
			}
		});

		new Setting(containerEl)
			.addButton((btn) =>
				btn.setButtonText('添加属性').onClick(async () => {
					this.plugin.settings.propertyFields.push(
						this.createEmptyField(),
					);
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('添加分隔符').onClick(async () => {
					this.plugin.settings.propertyFields.push({
						kind: 'separator',
						label: '',
					});
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('添加并排容器').onClick(async () => {
					this.plugin.settings.propertyFields.push({
						kind: 'row',
						label: '',
						children: [],
					});
					await this.plugin.saveSettings();
					this.display();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText('恢复默认').onClick(() => {
					new ConfirmModal(
						this.app,
						'恢复默认文档属性？',
						'将清除当前属性配置（含顺序、分隔符与并排容器），并恢复为默认的 title / aliases / tags。此操作不可撤销。',
						'确认恢复',
						async () => {
							this.plugin.settings.propertyFields =
								DEFAULT_PROPERTY_FIELDS.map((item) =>
									clonePropertySettingsItem(item),
								);
							await this.plugin.saveSettings();
							this.display();
						},
					).open();
				}),
			);
	}

	private createEmptyField(): PropertyFieldConfig {
		return {
			kind: 'field',
			key: '',
			type: 'text',
			label: '',
			showHint: false,
		};
	}

	private renderFieldRow(
		parent: HTMLElement,
		field: PropertyFieldConfig,
		path: DragPath,
		opts?: { nested?: boolean },
	): void {
		const row = parent.createDiv({
			cls: [
				'f2-rename-setting-property-row',
				opts?.nested ? 'is-nested' : '',
			]
				.filter(Boolean)
				.join(' '),
		});

		const handle = this.createDragHandle(row);
		this.attachDragHandlers(row, handle, path, 'field');

		const main = row.createDiv({
			cls: 'f2-rename-setting-property-main',
		});

		const line = main.createDiv({
			cls: 'f2-rename-setting-property-line',
		});

		const keyInput = this.createLabeledInput(
			line,
			'属性名',
			field.key,
			async (value) => {
				field.key = value.trim();
				await this.plugin.saveSettings();
			},
		);
		keyInput.addClass('f2-rename-setting-key');
		keyInput.setAttr('placeholder', '从库中选择或输入');
		new PropertyKeySuggest(this.app, keyInput, (key) => {
			field.key = key;
			const mapped = resolvePropertyFieldType(this.app, key);
			if (mapped) {
				field.type = mapped;
				if (mapped !== 'list') {
					field.showHint = false;
				} else if (field.showHint == null) {
					field.showHint = false;
				}
			}
			if (!field.label?.trim()) {
				field.label = key;
			}
			void (async () => {
				await this.plugin.saveSettings();
				// Always re-render so the type dropdown reflects the resolved type.
				this.display();
			})();
		});

		const typeWrap = line.createDiv({
			cls: 'f2-rename-setting-labeled',
		});
		typeWrap.createSpan({
			text: '类型',
			cls: 'f2-rename-setting-inline-label',
		});
		const select = typeWrap.createEl('select', {
			cls: 'dropdown f2-rename-setting-type',
		});
		for (const opt of PROPERTY_TYPE_OPTIONS) {
			select.createEl('option', {
				text: opt.label,
				attr: { value: opt.type },
			});
		}
		select.value = field.type;
		select.addEventListener('change', () => {
			void (async () => {
				field.type = select.value as PropertyFieldType;
				if (field.type !== 'list') {
					field.showHint = false;
				}
				await this.plugin.saveSettings();
				this.display();
			})();
		});

		this.createLabeledInput(
			line,
			'别名',
			field.label ?? '',
			async (value) => {
				field.label = value;
				await this.plugin.saveSettings();
			},
		).addClass('f2-rename-setting-alias');

		if (field.type === 'list') {
			const hintToggle = line.createDiv({
				cls: 'f2-rename-setting-labeled f2-rename-setting-hint-toggle',
			});
			hintToggle.createSpan({
				text: '提示',
				cls: 'f2-rename-setting-inline-label',
			});
			const checkbox = hintToggle.createEl('input', {
				type: 'checkbox',
				cls: 'f2-rename-setting-show-hint',
			});
			checkbox.checked = field.showHint === true;
			checkbox.addEventListener('change', () => {
				field.showHint = checkbox.checked;
				void this.plugin.saveSettings();
			});
		}

		this.createDeleteButton(row, () => {
			this.removeAtPath(path);
		});
	}

	private renderSeparatorRow(
		parent: HTMLElement,
		item: Extract<PropertySettingsItem, { kind: 'separator' }>,
		path: DragPath,
	): void {
		const row = parent.createDiv({
			cls: 'f2-rename-setting-property-row f2-rename-setting-separator-row',
		});

		const handle = this.createDragHandle(row);
		this.attachDragHandlers(row, handle, path, 'separator');

		const main = row.createDiv({
			cls: 'f2-rename-setting-property-main',
		});
		const line = main.createDiv({
			cls: 'f2-rename-setting-property-line',
		});

		line.createSpan({
			text: '分隔符',
			cls: 'f2-rename-setting-separator-badge',
		});

		this.createLabeledInput(
			line,
			'标题（可选）',
			item.label ?? '',
			async (value) => {
				item.label = value;
				await this.plugin.saveSettings();
			},
		).addClass('f2-rename-setting-separator-label');

		this.createDeleteButton(row, () => {
			this.removeAtPath(path);
		});
	}

	private renderRowContainer(
		parent: HTMLElement,
		item: PropertyRowConfig,
		rowIndex: number,
	): void {
		const path: DragPath = { scope: 'root', index: rowIndex };
		const row = parent.createDiv({
			cls: 'f2-rename-setting-property-row f2-rename-setting-row-container',
		});

		const header = row.createDiv({
			cls: 'f2-rename-setting-row-header',
		});

		const handle = this.createDragHandle(header);
		this.attachDragHandlers(row, handle, path, 'row');

		const headerMain = header.createDiv({
			cls: 'f2-rename-setting-row-header-main',
		});
		headerMain.createSpan({
			text: '并排容器',
			cls: 'f2-rename-setting-row-badge',
		});

		const addBtn = headerMain.createEl('button', {
			cls: 'mod-cta f2-rename-setting-row-add',
			text: '添加属性',
			attr: { type: 'button' },
		});
		addBtn.addEventListener('click', () => {
			item.children.push(this.createEmptyField());
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});

		this.createDeleteButton(header, () => {
			this.plugin.settings.propertyFields.splice(rowIndex, 1);
		});

		const body = row.createDiv({
			cls: 'f2-rename-setting-row-body',
		});
		body.dataset.rowIndex = String(rowIndex);

		if (item.children.length === 0) {
			body.createDiv({
				cls: 'f2-rename-setting-row-empty',
				text: '拖入属性到此处，或点击「添加属性」',
			});
		}

		item.children.forEach((child, childIndex) => {
			this.renderFieldRow(
				body,
				child,
				{ scope: 'row', rowIndex, index: childIndex },
				{ nested: true },
			);
		});

		this.attachRowBodyDrop(body, rowIndex);
	}

	private createDragHandle(row: HTMLElement): HTMLElement {
		const handle = row.createDiv({
			cls: 'f2-rename-setting-drag-handle',
			attr: {
				title: '拖动排序',
				'aria-label': '拖动排序',
			},
		});
		setIcon(handle, 'grip-vertical');
		return handle;
	}

	private createDeleteButton(
		row: HTMLElement,
		onDelete: () => void,
	): void {
		const btn = row.createEl('button', {
			cls: 'clickable-icon f2-rename-setting-remove',
			attr: {
				type: 'button',
				'aria-label': '移除',
			},
		});
		setIcon(btn, 'trash-2');
		btn.addEventListener('click', () => {
			onDelete();
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}

	private createLabeledInput(
		parent: HTMLElement,
		label: string,
		value: string,
		onChange: (value: string) => void | Promise<void>,
	): HTMLInputElement {
		const wrap = parent.createDiv({
			cls: 'f2-rename-setting-labeled',
		});
		wrap.createSpan({
			text: label,
			cls: 'f2-rename-setting-inline-label',
		});
		const input = wrap.createEl('input', {
			type: 'text',
			cls: 'f2-rename-setting-input',
			value,
		});
		input.addEventListener('change', () => {
			void onChange(input.value);
		});
		input.addEventListener('blur', () => {
			void onChange(input.value);
		});
		return input;
	}

	private removeAtPath(path: DragPath): void {
		if (path.scope === 'root') {
			this.plugin.settings.propertyFields.splice(path.index, 1);
			return;
		}
		const row = this.plugin.settings.propertyFields[path.rowIndex];
		if (!row || !isPropertyRow(row)) return;
		row.children.splice(path.index, 1);
	}

	private takeAtPath(path: DragPath): PropertySettingsItem | null {
		if (path.scope === 'root') {
			const [item] = this.plugin.settings.propertyFields.splice(
				path.index,
				1,
			);
			return item ?? null;
		}
		const row = this.plugin.settings.propertyFields[path.rowIndex];
		if (!row || !isPropertyRow(row)) return null;
		const [child] = row.children.splice(path.index, 1);
		return child ?? null;
	}

	private insertAtRoot(index: number, item: PropertySettingsItem): void {
		const list = this.plugin.settings.propertyFields;
		const clamped = Math.max(0, Math.min(index, list.length));
		list.splice(clamped, 0, item);
	}

	private insertIntoRow(
		rowIndex: number,
		childIndex: number,
		field: PropertyFieldConfig,
	): void {
		const row = this.plugin.settings.propertyFields[rowIndex];
		if (!row || !isPropertyRow(row)) return;
		const clamped = Math.max(0, Math.min(childIndex, row.children.length));
		row.children.splice(clamped, 0, field);
	}

	private samePath(a: DragPath, b: DragPath): boolean {
		if (a.scope !== b.scope) return false;
		if (a.scope === 'root' && b.scope === 'root') {
			return a.index === b.index;
		}
		if (a.scope === 'row' && b.scope === 'row') {
			return a.rowIndex === b.rowIndex && a.index === b.index;
		}
		return false;
	}

	private attachRowBodyDrop(body: HTMLElement, rowIndex: number): void {
		body.addEventListener('dragover', (event) => {
			const from = this.dragPath;
			if (!from) return;
			if (from.scope === 'root') {
				const item = this.plugin.settings.propertyFields[from.index];
				if (!item || !isPropertyField(item)) return;
			}
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			body.addClass('is-drop-target');
		});

		body.addEventListener('dragleave', (event) => {
			const related = event.relatedTarget as Node | null;
			if (related && body.contains(related)) return;
			body.removeClass('is-drop-target');
		});

		body.addEventListener('drop', (event) => {
			event.preventDefault();
			event.stopPropagation();
			body.removeClass('is-drop-target');
			const from = this.readDragPath(event) ?? this.dragPath;
			if (!from) return;

			let insertAt = this.plugin.settings.propertyFields[rowIndex];
			if (!insertAt || !isPropertyRow(insertAt)) return;

			// Dropping onto empty area → append
			let childIndex = insertAt.children.length;

			// If dropping onto a nested child, use that child's index
			const nested = (event.target as HTMLElement | null)?.closest(
				'.f2-rename-setting-property-row.is-nested',
			) as HTMLElement | null;
			if (nested && body.contains(nested)) {
				const rows = Array.from(
					body.querySelectorAll(
						':scope > .f2-rename-setting-property-row.is-nested',
					),
				);
				const idx = rows.indexOf(nested);
				if (idx >= 0) {
					const rect = nested.getBoundingClientRect();
					childIndex =
						event.clientY < rect.top + rect.height / 2
							? idx
							: idx + 1;
				}
			}

			if (
				from.scope === 'row' &&
				from.rowIndex === rowIndex &&
				from.index < childIndex
			) {
				childIndex -= 1;
			}

			const moved = this.takeAtPath(from);
			if (!moved || !isPropertyField(moved)) {
				if (moved) this.restoreTaken(from, moved);
				return;
			}

			// Re-resolve row after possible splice that shifted indices
			let targetRowIndex = rowIndex;
			if (from.scope === 'root' && from.index < rowIndex) {
				targetRowIndex -= 1;
			}
			this.insertIntoRow(targetRowIndex, childIndex, moved);
			void (async () => {
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}

	private restoreTaken(path: DragPath, item: PropertySettingsItem): void {
		if (path.scope === 'root') {
			this.insertAtRoot(path.index, item);
		} else if (isPropertyField(item)) {
			this.insertIntoRow(path.rowIndex, path.index, item);
		}
	}

	private attachDragHandlers(
		row: HTMLElement,
		handle: HTMLElement,
		path: DragPath,
		kind: 'field' | 'separator' | 'row',
	): void {
		handle.setAttr('draggable', 'true');

		handle.addEventListener('dragstart', (event) => {
			this.dragPath = path;
			row.addClass('is-dragging');
			event.dataTransfer?.setData(DRAG_MIME, JSON.stringify(path));
			event.dataTransfer?.setData('text/plain', JSON.stringify(path));
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
			row.dataset.dragKind = kind;
		});

		handle.addEventListener('dragend', () => {
			row.removeClass('is-dragging');
			this.dragPath = null;
			clearDropTargets(this.containerEl);
		});

		row.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
			const from = this.dragPath;
			if (!from || this.samePath(from, path)) return;

			// Nested field rows: only accept field drops for reorder within / into handled by body
			if (path.scope === 'row') {
				if (from.scope === 'root') {
					const src = this.plugin.settings.propertyFields[from.index];
					if (!src || !isPropertyField(src)) return;
				}
			}

			clearDropTargets(this.containerEl);
			const rect = row.getBoundingClientRect();
			const before = event.clientY < rect.top + rect.height / 2;
			row.addClass(before ? 'drop-before' : 'drop-after');
		});

		row.addEventListener('dragleave', (event) => {
			const related = event.relatedTarget as Node | null;
			if (related && row.contains(related)) return;
			row.removeClass('drop-before');
			row.removeClass('drop-after');
		});

		row.addEventListener('drop', (event) => {
			const target = event.target as HTMLElement | null;
			if (
				path.scope === 'root' &&
				kind === 'row' &&
				target?.closest('.f2-rename-setting-row-body')
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			row.removeClass('drop-before');
			row.removeClass('drop-after');

			const from = this.readDragPath(event) ?? this.dragPath;
			if (!from || this.samePath(from, path)) return;

			// Dropping a field onto a row container (header) puts it inside.
			if (path.scope === 'root' && kind === 'row') {
				const src =
					from.scope === 'root'
						? this.plugin.settings.propertyFields[from.index]
						: null;
				const isField =
					from.scope === 'row' ||
					(src != null && isPropertyField(src));
				if (isField) {
					const moved = this.takeAtPath(from);
					if (!moved || !isPropertyField(moved)) {
						if (moved) this.restoreTaken(from, moved);
						return;
					}
					let rowIndex = path.index;
					if (from.scope === 'root' && from.index < path.index) {
						rowIndex -= 1;
					}
					const rowItem =
						this.plugin.settings.propertyFields[rowIndex];
					const insertAt =
						rowItem && isPropertyRow(rowItem)
							? rowItem.children.length
							: 0;
					this.insertIntoRow(rowIndex, insertAt, moved);
					void (async () => {
						await this.plugin.saveSettings();
						this.display();
					})();
					return;
				}
			}

			const rect = row.getBoundingClientRect();
			const before = event.clientY < rect.top + rect.height / 2;

			void this.moveItem(from, path, before);
		});
	}

	private readDragPath(event: DragEvent): DragPath | null {
		const raw =
			event.dataTransfer?.getData(DRAG_MIME) ||
			event.dataTransfer?.getData('text/plain');
		if (!raw) return null;
		try {
			return JSON.parse(raw) as DragPath;
		} catch {
			return null;
		}
	}

	private async moveItem(
		from: DragPath,
		to: DragPath,
		before: boolean,
	): Promise<void> {
		// Dropping a field onto a root row container edge → insert beside the container at root
		// Dropping into row children is handled by attachRowBodyDrop

		if (to.scope === 'row') {
			// Only fields can live inside rows
			const peek =
				from.scope === 'root'
					? this.plugin.settings.propertyFields[from.index]
					: null;
			if (from.scope === 'root' && peek && !isPropertyField(peek)) {
				return;
			}

			let insertIndex = before ? to.index : to.index + 1;
			if (
				from.scope === 'row' &&
				from.rowIndex === to.rowIndex &&
				from.index < insertIndex
			) {
				insertIndex -= 1;
			}

			const moved = this.takeAtPath(from);
			if (!moved || !isPropertyField(moved)) {
				if (moved) this.restoreTaken(from, moved);
				return;
			}

			let rowIndex = to.rowIndex;
			if (from.scope === 'root' && from.index < to.rowIndex) {
				rowIndex -= 1;
			}
			this.insertIntoRow(rowIndex, insertIndex, moved);
			await this.plugin.saveSettings();
			this.display();
			return;
		}

		// Target is root
		let insertIndex = before ? to.index : to.index + 1;

		// Special: drop field onto row container — if dropping "into" center of row, put inside
		const targetItem = this.plugin.settings.propertyFields[to.index];
		if (
			targetItem &&
			isPropertyRow(targetItem) &&
			from.scope === 'root'
		) {
			const src = this.plugin.settings.propertyFields[from.index];
			if (src && isPropertyField(src)) {
				// Use before/after for sibling placement at root (already computed)
			}
		}

		if (from.scope === 'root' && from.index < insertIndex) {
			insertIndex -= 1;
		}
		if (from.scope === 'root' && from.index === to.index) return;

		const moved = this.takeAtPath(from);
		if (!moved) return;

		if (from.scope === 'row' && !isPropertyField(moved)) {
			this.restoreTaken(from, moved);
			return;
		}

		// Adjust insert index if we removed from a row that sits before target
		if (from.scope === 'row' && from.rowIndex < to.index) {
			// root length unchanged for insert position of root items after the row
		}
		if (from.scope === 'root' && from.index < to.index) {
			// already adjusted
		}

		this.insertAtRoot(insertIndex, moved);
		await this.plugin.saveSettings();
		this.display();
	}
}

function clearDropTargets(parent: HTMLElement | null): void {
	if (!parent) return;
	parent
		.querySelectorAll(
			'.f2-rename-setting-property-row.drop-before, .f2-rename-setting-property-row.drop-after, .f2-rename-setting-row-body.is-drop-target',
		)
		.forEach((el) => {
			el.removeClass('drop-before');
			el.removeClass('drop-after');
			el.removeClass('is-drop-target');
		});
}
