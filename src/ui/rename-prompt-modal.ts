import { App, Modal, setIcon } from 'obsidian';

export interface RenamePromptResult {
	name: string;
	/** Present when the alias field was shown. */
	alias?: string;
}

export interface RenamePromptOptions {
	/** Show and prefill the alias field (embed links). */
	showAlias?: boolean;
	alias?: string | null;
	nameLabel?: string;
	aliasLabel?: string;
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

		const header = contentEl.createDiv({ cls: 'f2-rename-header' });
		const iconWrap = header.createDiv({ cls: 'f2-rename-icon' });
		setIcon(iconWrap, 'pencil');
		header.createEl('h2', {
			text: this.titleText,
			cls: 'f2-rename-title',
		});

		const body = contentEl.createDiv({ cls: 'f2-rename-body' });

		this.inputEl = this.createField(
			body,
			{
				id: 'f2-rename-input',
				label: this.options.nameLabel ?? '新名称',
				value: this.defaultValue,
			},
			(v) => {
				this.value = v;
			},
		);

		if (this.options.showAlias) {
			this.aliasInputEl = this.createField(
				body,
				{
					id: 'f2-rename-alias-input',
					label: this.options.aliasLabel ?? '别名',
					value: this.aliasValue,
					placeholder: '可选，对应 | 后的显示名',
				},
				(v) => {
					this.aliasValue = v;
				},
			);
		}

		body.createDiv({ cls: 'f2-rename-options' });

		const footer = contentEl.createDiv({ cls: 'f2-rename-footer' });
		const cancelBtn = footer.createEl('button', {
			text: '取消',
			cls: 'f2-rename-btn',
		});
		cancelBtn.addEventListener('click', () => this.submit(null));

		const confirmBtn = footer.createEl('button', {
			text: '重命名',
			cls: 'f2-rename-btn f2-rename-btn-primary mod-cta',
		});
		confirmBtn.addEventListener('click', () => this.submitResult());

		window.setTimeout(() => {
			const focusEl =
				this.options.showAlias && this.aliasValue
					? (this.aliasInputEl ?? this.inputEl)
					: this.inputEl;
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
		},
		onInput: (value: string) => void,
	): HTMLInputElement {
		const field = parent.createDiv({ cls: 'f2-rename-field' });
		field.createEl('label', {
			text: opts.label,
			cls: 'f2-rename-label',
			attr: { for: opts.id },
		});

		const input = field.createEl('input', {
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
		return input;
	}

	private submitResult(): void {
		const result: RenamePromptResult = { name: this.value };
		if (this.options.showAlias) {
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
