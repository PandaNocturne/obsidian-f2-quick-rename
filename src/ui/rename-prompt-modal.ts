import { App, Modal, setIcon } from 'obsidian';

/**
 * Rename panel. Layout is sectioned so options / extras can be added later
 * without reshaping the header, field, or footer.
 */
export class RenamePromptModal extends Modal {
	private readonly titleText: string;
	private readonly defaultValue: string;
	private readonly onSubmit: (value: string | null) => void;
	private value: string;
	private resolved = false;
	private inputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		titleText: string,
		defaultValue: string,
		onSubmit: (value: string | null) => void,
	) {
		super(app);
		this.titleText = titleText;
		this.defaultValue = defaultValue;
		this.value = defaultValue;
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

		const field = body.createDiv({ cls: 'f2-rename-field' });
		field.createEl('label', {
			text: '新名称',
			cls: 'f2-rename-label',
			attr: { for: 'f2-rename-input' },
		});

		this.inputEl = field.createEl('input', {
			type: 'text',
			cls: 'f2-rename-input',
			attr: {
				id: 'f2-rename-input',
				spellcheck: 'false',
				autocomplete: 'off',
				'aria-label': '新名称',
			},
		});
		this.inputEl.value = this.defaultValue;
		this.inputEl.addEventListener('input', () => {
			this.value = this.inputEl?.value ?? '';
		});
		this.inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.submit(this.value);
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				this.submit(null);
			}
		});

		// Reserved for future controls (e.g. update links, companions).
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
		confirmBtn.addEventListener('click', () => this.submit(this.value));

		window.setTimeout(() => {
			this.inputEl?.focus();
			this.inputEl?.select();
		}, 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.inputEl = null;
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
	}

	private submit(value: string | null): void {
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
): Promise<string | null> {
	return new Promise((resolve) => {
		new RenamePromptModal(app, title, defaultValue, resolve).open();
	});
}
