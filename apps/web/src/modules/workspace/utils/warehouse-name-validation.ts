import { nameValidationKeyMapper } from 'shared/utils/name-validation';

/**
 * Translates a Warehouse-name rejection's rule into its validation key (AC-08).
 * Shared by add and rename, which both write the one Warehouse Name value
 * object.
 */
export const warehouseNameValidationKey = nameValidationKeyMapper({
  prefix: 'warehouseName',
  fallbackSuffix: 'unsupportedCharacter',
});
