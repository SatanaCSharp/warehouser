/**
 * The translation key that names one catalogue entry of a Permission group.
 *
 * A Permission identifier carries a `:` that i18next reads as a namespace
 * separator, so every catalogue key replaces it with `_`. That substitution is
 * the convention, not an implementation detail of either label hook, which is
 * why both reach it here.
 */
export const permissionTranslationKey = (
  group: string,
  permissionId: string,
): string => `${group}.items.${permissionId.replace(':', '_')}`;
