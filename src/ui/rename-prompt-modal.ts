import { App, Modal, Setting } from 'obsidian';

/**
 * Simple text prompt, replacing QuickAdd's inputPrompt.
 */
export class RenamePromptModal extends Modal {
	private readonly titleText: string;
	private readonly defaultValue: string;
	private readonly onSubmit: (value: string | null) => void;
	private value: string;
	private resolved = false;

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

		contentEl.createEl('h2', { text: this.titleText });

		new Setting(contentEl)
			.addText((text) => {
				text.inputEl.addClass('f2-rename-input');
				text.setValue(this.defaultValue);
				text.onChange((v) => {
					this.value = v;
				});
				text.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter') {
						evt.preventDefault();
						this.submit(this.value);
					} else if (evt.key === 'Escape') {
						evt.preventDefault();
						this.submit(null);
					}
				});
				window.setTimeout(() => {
					text.inputEl.focus();
					text.inputEl.select();
				}, 50);
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('取消')
					.onClick(() => this.submit(null)),
			)
			.addButton((btn) =>
				btn
					.setButtonText('重命名')
					.setCta()
					.onClick(() => this.submit(this.value)),
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
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
