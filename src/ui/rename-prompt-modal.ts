import { App, Modal, setIcon } from 'obsidian';

export interface RenamePromptResult {
	name: string;
	/** Present when the alias/title field was shown. */
	alias?: string;
}

export interface RenamePromptOptions {
	/**
	 * `file` — filename (+ optional alias) with extension suffix.
	 * `url` — title + URL fields for markdown web links.
	 */
	mode?: 'file' | 'url';
	/** Show and prefill the alias / title field. */
	showAlias?: boolean;
	alias?: string | null;
	nameLabel?: string;
	aliasLabel?: string;
	/**
	 * File extension shown after the name input (e.g. `.md`, `.png`).
	 * Include the leading dot. Ignored in `url` mode.
	 */
	extension?: string;
}

/**
 * Rename panel. Layout is sectioned so options / extras can be added later
 * without reshaping the header, field, or footer.
 */
export class RenamePromptModal extends Modal {
	private readonly titleText: string;
	private readonly defaultValue: string;
	private readonly options: RenamePromptOptions;
	private readonly onSubmit: (value: RenamePromptResult | null) => void;
	private value: string;
	private aliasValue: string;
	private resolved = false;
	private inputEl: HTMLInputElement | null = null;
	private aliasInputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		titleText: string,
		defaultValue: string,
		onSubmit: (value: RenamePromptResult | null) => void,
		options: RenamePromptOptions = {},
	) {
		super(app);
		this.titleText = titleText;
		this.defaultValue = defaultValue;
		this.value = defaultValue;
		this.options = options;
		this.aliasValue = options.alias ?? '';
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('f2-rename-modal');
		if (this.options.mode === 'url') {
			this.modalEl.addClass('f2-rename-modal-url');
		}

		const header = contentEl.createDiv({ cls: 'f2-rename-header' });
		const iconWrap = header.createDiv({ cls: 'f2-rename-icon' });
		setIcon(iconWrap, this.options.mode === 'url' ? 'link' : 'pencil');
		header.createEl('h2', {
			text: this.titleText,
			cls: 'f2-rename-title',
		});

		const body = contentEl.createDiv({ cls: 'f2-rename-body' });
		const form = body.createDiv({ cls: 'f2-rename-form' });

		const isUrl = this.options.mode === 'url';
		const showAlias = this.options.showAlias ?? isUrl;

		const nameField = {
			id: 'f2-rename-input',
			label: this.options.nameLabel ?? (isUrl ? 'URL' : '文件名'),
			value: this.defaultValue,
			suffix: isUrl ? undefined : this.options.extension,
			placeholder: isUrl ? 'https://…' : undefined,
		};

		const aliasField = showAlias
			? {
					id: 'f2-rename-alias-input',
					label: this.options.aliasLabel ?? (isUrl ? '标题' : '别名'),
					value: this.aliasValue,
					placeholder: isUrl
						? '链接显示标题'
						: '可选，对应 | 后的显示名',
				}
			: null;

		// URL links: 标题 then URL. Files: 文件名 then 别名.
		if (isUrl && aliasField) {
			this.aliasInputEl = this.createField(form, aliasField, (v) => {
				this.aliasValue = v;
			});
			this.inputEl = this.createField(form, nameField, (v) => {
				this.value = v;
			});
		} else {
			this.inputEl = this.createField(form, nameField, (v) => {
				this.value = v;
			});
			if (aliasField) {
				this.aliasInputEl = this.createField(form, aliasField, (v) => {
					this.aliasValue = v;
				});
			}
		}

		body.createDiv({ cls: 'f2-rename-options' });

		const footer = contentEl.createDiv({ cls: 'f2-rename-footer' });
		const cancelBtn = footer.createEl('button', {
			text: '取消',
			cls: 'f2-rename-btn',
		});
		cancelBtn.addEventListener('click', () => this.submit(null));

		const confirmBtn = footer.createEl('button', {
			text: isUrl ? '保存' : '重命名',
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta',
		});
		confirmBtn.addEventListener('click', () => this.submitResult());

		window.setTimeout(() => {
			let focusEl = this.inputEl;
			if (isUrl) {
				focusEl = this.aliasValue
					? (this.aliasInputEl ?? this.inputEl)
					: this.inputEl;
			} else if (showAlias && this.aliasValue) {
				focusEl = this.aliasInputEl ?? this.inputEl;
			}
			focusEl?.focus();
			focusEl?.select();
		}, 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.inputEl = null;
		this.aliasInputEl = null;
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
	}

	private createField(
		parent: HTMLElement,
		opts: {
			id: string;
			label: string;
			value: string;
			placeholder?: string;
			suffix?: string;
		},
		onInput: (value: string) => void,
	): HTMLInputElement {
		const field = parent.createDiv({ cls: 'f2-rename-field' });
		field.createEl('label', {
			text: opts.label,
			cls: 'f2-rename-label',
			attr: { for: opts.id },
		});

		const control = field.createDiv({ cls: 'f2-rename-control' });
		const input = control.createEl('input', {
			type: 'text',
			cls: 'f2-rename-input',
			attr: {
				id: opts.id,
				spellcheck: 'false',
				autocomplete: 'off',
				'aria-label': opts.label,
				...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
			},
		});
		input.value = opts.value;
		input.addEventListener('input', () => onInput(input.value));
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.submitResult();
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				this.submit(null);
			}
		});

		if (opts.suffix) {
			control.createSpan({
				text: opts.suffix,
				cls: 'f2-rename-ext',
			});
		}

		return input;
	}

	private submitResult(): void {
		const result: RenamePromptResult = { name: this.value };
		if (this.options.showAlias || this.options.mode === 'url') {
			result.alias = this.aliasValue;
		}
		this.submit(result);
	}

	private submit(value: RenamePromptResult | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.close();
		this.onSubmit(value);
	}
}

export function promptRename(
	app: App,
	title: string,
	defaultValue: string,
	options: RenamePromptOptions = {},
): Promise<RenamePromptResult | null> {
	return new Promise((resolve) => {
		new RenamePromptModal(
			app,
			title,
			defaultValue,
			resolve,
			options,
		).open();
	});
}
