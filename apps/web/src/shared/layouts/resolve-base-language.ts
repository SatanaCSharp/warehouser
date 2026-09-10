/**
 * The language-tag reduction `LanguageSelector` renders against, in its own module.
 *
 * It lives here rather than beside the component because `react/only-export-components` is a Vite
 * concern before it is a React one: a module that exports both a component and a plain function
 * cannot be hot-replaced, so every edit to `LanguageSelector.tsx` would discard the local state a
 * developer is in the middle of reproducing. The function has its own suite, which is what made it
 * an export in the first place.
 */
export type SupportedLanguage = 'en' | 'uk';

/**
 * Reduces a BCP 47 tag to the language this application actually ships, defaulting to English for
 * anything it does not recognise — including an unresolved tag.
 */
export const resolveBaseLanguage = (
  language: string | undefined,
): SupportedLanguage => (language?.split('-')[0] === 'uk' ? 'uk' : 'en');
