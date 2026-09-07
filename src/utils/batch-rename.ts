import { App, TFile, moment, normalizePath } from 'obsidian';
import { normalizeSpaces } from './embed';

export type BatchRenameMode = 'format' | 'replace';

export type BatchTextCase = 'none' | 'upper' | 'lower' | 'title';

export const DEFAULT_BATCH_NAME_TEMPLATE = '{name}{ext}';

export interface BatchRenamePreview {
	file: TFile;
	/** Full new leaf name including extension when present. */
	newName: string;
	/** True when newName differs from the current leaf name. */
	changed: boolean;
	/** Conflict / empty / invalid. */
	error?: 'empty' | 'invalid' | 'collision';
}

export interface BatchFormatOptions {
	template: string;
	textCase: BatchTextCase;
	/** 1-based start index for `{n}` / `{index}`. */
	startIndex?: number;
}

export interface BatchReplaceOptions {
	find: string;
	replace: string;
	/** Treat `find` as a regular expression. */
	useRegex?: boolean;
	/** Replace on basename only and keep the original extension. */
	basenameOnly?: boolean;
	textCase: BatchTextCase;
}

/** Tokens shown in the format-mode tip / chip row. */
export const BATCH_PLACEHOLDERS: ReadonlyArray<{
	token: string;
	/** i18n key suffix under modal.batch.placeholder.* */
	labelKey: 'name' | 'ext' | 'index' | 'date';
}> = [
	{ token: '{name}', labelKey: 'name' },
	{ token: '{ext}', labelKey: 'ext' },
	{ token: '{n}', labelKey: 'index' },
	{ token: '{date}', labelKey: 'date' },
];

/**
 * Expand a full-filename template.
 * Tokens: `{name}`, `{ext}`, `{n}`/`{index}`/`{index:pad}`, `{date}`/`{date:fmt}`,
 * `{ctime:fmt}`, `{mtime:fmt}`, `{folder}`.
 *
 * When `nameOverride` / `extOverride` are set, `{name}` / `{ext}` use those
 * (for step-by-step transforms on the current working filename).
 */
export function expandBatchNameTemplate(
	file: TFile,
	template: string,
	index: number,
	overrides?: { name?: string; ext?: string },
): string {
	const ext =
		overrides?.ext ?? (file.extension ? `.${file.extension}` : '');
	const name = overrides?.name ?? file.basename;
	const folder = file.parent?.name ?? '';
	let result = template;

	result = result.replace(/\{ctime(?::([^}]+))?\}/gi, (_m, fmt?: string) =>
		moment(file.stat.ctime).format(fmt || 'YYYYMMDD'),
	);
	result = result.replace(/\{mtime(?::([^}]+))?\}/gi, (_m, fmt?: string) =>
		moment(file.stat.mtime).format(fmt || 'YYYYMMDD'),
	);
	result = result.replace(/\{date(?::([^}]+))?\}/gi, (_m, fmt?: string) =>
		moment().format(fmt || 'YYYYMMDD'),
	);
	result = result.replace(
		/\{(?:n|index)(?::(\d+))?\}/gi,
		(_m, pad?: string) => {
			const width = pad ? Number(pad) : 0;
			const raw = String(index);
			return width > 0 ? raw.padStart(width, '0') : raw;
		},
	);
	result = result.replace(/\{folder\}/gi, () => folder);
	result = result.replace(/\{name\}/gi, () => name);
	result = result.replace(/\{ext\}/gi, () => ext);

	return normalizeSpaces(result);
}

/** Split a working leaf name into basename + extension (prefer file.ext). */
export function splitWorkingLeafName(
	file: TFile,
	workingName: string,
): { name: string; ext: string } {
	const fileExt = file.extension ? `.${file.extension}` : '';
	if (
		fileExt &&
		workingName.toLowerCase().endsWith(fileExt.toLowerCase())
	) {
		return {
			name: workingName.slice(0, -fileExt.length),
			ext: workingName.slice(-fileExt.length),
		};
	}
	const dot = workingName.lastIndexOf('.');
	if (dot > 0) {
		return {
			name: workingName.slice(0, dot),
			ext: workingName.slice(dot),
		};
	}
	return { name: workingName, ext: '' };
}

/**
 * Apply find/replace on a string. When `useRegex` is true, `find` is a
 * RegExp source and `replace` may use `$1`, `$2`, … capture refs.
 * Invalid patterns return the original text unchanged.
 */
export function applyFindReplace(
	text: string,
	find: string,
	replace: string,
	useRegex: boolean,
): { result: string; error?: 'invalid-regex' } {
	if (!find) return { result: text };
	if (!useRegex) {
		return { result: text.split(find).join(replace) };
	}
	try {
		const re = new RegExp(find, 'g');
		return { result: text.replace(re, replace) };
	} catch {
		return { result: text, error: 'invalid-regex' };
	}
}

/** Remove numbering / digit runs from a basename and tidy leftover separators. */
export function removeNumbering(basename: string): string {
	let result = basename
		.replace(/[(\[{（【［]\s*\d+\s*[)\]}）】］]/g, '')
		.replace(/\d+/g, '');
	result = result
		.replace(/[_\-\s.·•]+/g, (chunk) => {
			if (chunk.includes('_')) return '_';
			if (chunk.includes('-')) return '-';
			if (chunk.includes('.')) return '.';
			return ' ';
		})
		.replace(/^[_\-.\s]+|[_\-.\s]+$/g, '')
		.trim();
	return result;
}

/**
 * Insert a space between CJK characters and Latin letters / digits
 * (both directions). Does not duplicate existing spaces.
 */
export function addSpaceBetweenCjkAndLatin(text: string): string {
	const cjk = '\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF';
	const latin = 'A-Za-z0-9';
	return text
		.replace(new RegExp(`([${cjk}])([${latin}])`, 'g'), '$1 $2')
		.replace(new RegExp(`([${latin}])([${cjk}])`, 'g'), '$1 $2');
}

export interface BatchTextProcessOptions {
	removeNumbering?: boolean;
	spaceCjkLatin?: boolean;
}

/**
 * Apply one format / replace / case / text-process step to working names.
 * Does not touch the vault — preview only.
 */
export function applyBatchProcessStep(
	files: TFile[],
	workingNames: Map<string, string>,
	mode: BatchRenameMode,
	opts: {
		template: string;
		find: string;
		replace: string;
		useRegex?: boolean;
		textCase: BatchTextCase;
		textProcess?: BatchTextProcessOptions;
		startIndex?: number;
	},
): { names: Map<string, string>; error?: 'invalid-regex' } {
	const start = opts.startIndex ?? 1;
	const next = new Map(workingNames);
	let stepError: 'invalid-regex' | undefined;
	const process = opts.textProcess ?? {};

	files.forEach((file, i) => {
		const current = workingNames.get(file.path) ?? file.name;
		const parts = splitWorkingLeafName(file, current);
		let newName: string;

		if (mode === 'replace') {
			if (!opts.find) {
				newName = current;
			} else {
				const replaced = applyFindReplace(
					parts.name,
					opts.find,
					opts.replace,
					Boolean(opts.useRegex),
				);
				if (replaced.error) stepError = replaced.error;
				newName = `${replaced.result}${parts.ext}`;
			}
		} else {
			const template =
				opts.template.trim() || DEFAULT_BATCH_NAME_TEMPLATE;
			newName = expandBatchNameTemplate(file, template, start + i, {
				name: parts.name,
				ext: parts.ext,
			});
		}

		if (process.removeNumbering || process.spaceCjkLatin) {
			const split = splitWorkingLeafName(file, newName);
			let base = split.name;
			if (process.removeNumbering) base = removeNumbering(base);
			if (process.spaceCjkLatin) base = addSpaceBetweenCjkAndLatin(base);
			newName = `${base}${split.ext}`;
		}

		newName = applyTextCaseKeepingExt(file, newName, opts.textCase);
		next.set(file.path, normalizeSpaces(newName) || current);
	});

	return { names: next, error: stepError };
}

/** Build preview rows from a working-name map. */
export function previewFromWorkingNames(
	app: App,
	files: TFile[],
	workingNames: Map<string, string>,
): BatchRenamePreview[] {
	const draft = files.map((file) =>
		finalizePreviewRow(file, workingNames.get(file.path) ?? file.name),
	);
	return markCollisions(app, draft);
}

export function applyTextCase(value: string, mode: BatchTextCase): string {
	if (mode === 'none' || !value) return value;
	if (mode === 'upper') return value.toUpperCase();
	if (mode === 'lower') return value.toLowerCase();
	// Title-ish: capitalize first letter of each whitespace-separated word.
	return value
		.split(/(\s+)/)
		.map((part) => {
			if (/^\s+$/.test(part) || !part) return part;
			return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
		})
		.join('');
}

/** Apply case to the basename; keep a trailing extension's original casing. */
export function applyTextCaseKeepingExt(
	file: TFile,
	value: string,
	mode: BatchTextCase,
): string {
	if (mode === 'none' || !value) return value;
	const ext = file.extension ? `.${file.extension}` : '';
	if (ext && value.toLowerCase().endsWith(ext.toLowerCase())) {
		const base = value.slice(0, -ext.length);
		return applyTextCase(base, mode) + ext;
	}
	return applyTextCase(value, mode);
}

/** Characters that must not appear in a vault leaf name. */
export function isInvalidLeafName(name: string): boolean {
	if (!name || name === '.' || name === '..') return true;
	if (/[\\/:*?"<>|]/.test(name)) return true;
	if (name.includes('\0')) return true;
	return false;
}

export function previewFormatRename(
	app: App,
	files: TFile[],
	opts: BatchFormatOptions,
): BatchRenamePreview[] {
	const start = opts.startIndex ?? 1;
	const template = opts.template.trim() || DEFAULT_BATCH_NAME_TEMPLATE;
	const draft = files.map((file, i) => {
		let newName = expandBatchNameTemplate(file, template, start + i);
		newName = applyTextCaseKeepingExt(file, newName, opts.textCase);
		return finalizePreviewRow(file, newName);
	});
	return markCollisions(app, draft);
}

export function previewReplaceRename(
	app: App,
	files: TFile[],
	opts: BatchReplaceOptions,
): BatchRenamePreview[] {
	const find = opts.find;
	const draft = files.map((file) => {
		let newName: string;
		if (!find) {
			newName = file.name;
		} else if (opts.basenameOnly !== false) {
			const ext = file.extension ? `.${file.extension}` : '';
			const replaced = applyFindReplace(
				file.basename,
				find,
				opts.replace,
				Boolean(opts.useRegex),
			);
			newName = `${replaced.result}${ext}`;
		} else {
			const replaced = applyFindReplace(
				file.name,
				find,
				opts.replace,
				Boolean(opts.useRegex),
			);
			newName = replaced.result;
		}
		newName = applyTextCaseKeepingExt(file, newName, opts.textCase);
		return finalizePreviewRow(file, newName);
	});
	return markCollisions(app, draft);
}

function finalizePreviewRow(file: TFile, rawName: string): BatchRenamePreview {
	const newName = normalizeSpaces(rawName);
	if (!newName) {
		return { file, newName: '', changed: true, error: 'empty' };
	}
	if (isInvalidLeafName(newName)) {
		return { file, newName, changed: true, error: 'invalid' };
	}
	const parentPath = file.parent?.path ?? '';
	const newPath = normalizePath(
		parentPath ? `${parentPath}/${newName}` : newName,
	);
	return { file, newName, changed: newPath !== file.path };
}

function markCollisions(
	app: App,
	rows: BatchRenamePreview[],
): BatchRenamePreview[] {
	const targetCounts = new Map<string, number>();
	const targetBySource = new Map<string, string>();

	for (const row of rows) {
		if (row.error) continue;
		const parentPath = row.file.parent?.path ?? '';
		const newPath = normalizePath(
			parentPath ? `${parentPath}/${row.newName}` : row.newName,
		);
		const key = newPath.toLowerCase();
		targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
		targetBySource.set(row.file.path, newPath);
	}

	return rows.map((row) => {
		if (row.error || !row.changed) return row;
		const parentPath = row.file.parent?.path ?? '';
		const newPath = normalizePath(
			parentPath ? `${parentPath}/${row.newName}` : row.newName,
		);
		const key = newPath.toLowerCase();
		if ((targetCounts.get(key) ?? 0) > 1) {
			return { ...row, error: 'collision' as const };
		}

		const existing = app.vault.getAbstractFileByPath(newPath);
		if (!existing || existing.path === row.file.path) return row;

		const peerTarget = targetBySource.get(existing.path);
		// Peer stays put, or is outside this batch → conflict.
		if (!peerTarget || peerTarget === existing.path) {
			return { ...row, error: 'collision' as const };
		}
		return row;
	});
}

/**
 * Resolve a unique path in the same folder for `newName`.
 * Appends `-1`, `-2`, … on collision (skips the file itself).
 */
export function buildUniqueBatchPath(
	app: App,
	file: TFile,
	newName: string,
): string {
	const parent = file.parent?.path ?? '';
	let candidate = normalizePath(parent ? `${parent}/${newName}` : newName);
	if (candidate === file.path) return candidate;

	const dot = newName.lastIndexOf('.');
	const hasExt = dot > 0;
	const stem = hasExt ? newName.slice(0, dot) : newName;
	const ext = hasExt ? newName.slice(dot) : '';

	let suffix = 1;
	while (true) {
		const existing = app.vault.getAbstractFileByPath(candidate);
		if (!existing || existing.path === file.path) return candidate;
		const leafN = `${stem}-${suffix}${ext}`;
		candidate = normalizePath(parent ? `${parent}/${leafN}` : leafN);
		suffix += 1;
	}
}

export interface BatchRenameStep {
	/** Source file path at the start of this step. */
	fromPath: string;
	/** Destination path for this step. */
	toPath: string;
	/** Display name for progress UI. */
	label: string;
	/** True for the final-name phase (counts toward progress). */
	isFinal: boolean;
}

/**
 * Build a two-phase rename plan so chain / swap conflicts are safe:
 * 1) move each file to a unique temporary name
 * 2) move each temporary file to its final name
 */
export function planBatchRenameSteps(
	app: App,
	items: { file: TFile; newName: string }[],
): BatchRenameStep[] {
	const steps: BatchRenameStep[] = [];
	const batchPaths = new Set(items.map((item) => item.file.path));
	const finals: Array<{ file: TFile; finalPath: string; label: string }> = [];

	for (const item of items) {
		const parent = item.file.parent?.path ?? '';
		let finalPath = normalizePath(
			parent ? `${parent}/${item.newName}` : item.newName,
		);
		if (finalPath === item.file.path) continue;

		const existing = app.vault.getAbstractFileByPath(finalPath);
		if (
			existing &&
			existing.path !== item.file.path &&
			!batchPaths.has(existing.path)
		) {
			finalPath = buildUniqueBatchPath(app, item.file, item.newName);
			if (finalPath === item.file.path) continue;
		}

		finals.push({
			file: item.file,
			finalPath,
			label: item.file.name,
		});
	}
	if (finals.length === 0) return steps;

	const token = Date.now().toString(36);
	const temps: Array<{
		tempPath: string;
		finalPath: string;
		label: string;
		fromPath: string;
	}> = [];

	for (let i = 0; i < finals.length; i++) {
		const row = finals[i];
		if (!row) continue;
		const parent = row.file.parent?.path ?? '';
		const ext = row.file.extension ? `.${row.file.extension}` : '';
		const tempName = `__f2batch_${token}_${i}${ext}`;
		const tempPath = normalizePath(
			parent ? `${parent}/${tempName}` : tempName,
		);
		temps.push({
			fromPath: row.file.path,
			tempPath,
			finalPath: row.finalPath,
			label: row.label,
		});
		steps.push({
			fromPath: row.file.path,
			toPath: tempPath,
			label: row.label,
			isFinal: false,
		});
	}

	for (const row of temps) {
		steps.push({
			fromPath: row.tempPath,
			toPath: row.finalPath,
			label: row.label,
			isFinal: true,
		});
	}

	return steps;
}
