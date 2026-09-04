import { getLanguage } from 'obsidian';
import { en, type TranslationKey } from './en';
import { zhCN } from './zh-cn';

/** User preference stored in settings. */
export type LocalePreference = 'system' | 'zh-CN' | 'en';

/** Resolved UI locale. */
export type ResolvedLocale = 'zh-CN' | 'en';

const catalogs: Record<ResolvedLocale, Record<TranslationKey, string>> = {
	en,
	'zh-CN': zhCN,
};

let preference: LocalePreference = 'system';

export function setLocalePreference(next: LocalePreference): void {
	preference = next;
}

export function getLocalePreference(): LocalePreference {
	return preference;
}

export function resolveLocale(
	pref: LocalePreference = preference,
): ResolvedLocale {
	if (pref === 'zh-CN' || pref === 'en') return pref;
	const lang = getLanguage().toLowerCase().replace(/_/g, '-');
	if (lang === 'zh' || lang.startsWith('zh-')) return 'zh-CN';
	return 'en';
}

export type TranslateVars = Record<string, string | number>;

/**
 * Translate a UI string for the current locale preference.
 * Placeholders use `{name}` and are replaced from `vars`.
 */
export function t(key: TranslationKey, vars?: TranslateVars): string {
	const locale = resolveLocale();
	let text = catalogs[locale][key] ?? catalogs.en[key] ?? key;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replaceAll(`{${name}}`, String(value));
		}
	}
	return text;
}

export type { TranslationKey };
