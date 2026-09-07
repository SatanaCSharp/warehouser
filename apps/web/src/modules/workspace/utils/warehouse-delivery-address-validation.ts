/**
 * The rule the server emits for a refused Warehouse Delivery Address, mapped
 * to the suffix of the validation key that explains it (AC-10).
 *
 * There is exactly one today — the address is text a member types and is never
 * validated, geocoded or interpreted, so the only rule over it is that
 * something was typed. An unrecognised rule still resolves to a real key
 * rather than rendering the server's own rule string at the member.
 */
const keySuffixesByRule: Record<string, string> = {
  trimmed_non_empty: 'required',
};

/**
 * The endpoint's own declaration of which key explains its refusal, composed
 * as `transformErrorResponse` so every caller of the endpoint gets the same
 * explanation (web-error-handling.md §3).
 */
export const warehouseDeliveryAddressValidationKey = <
  TFailure extends { fieldErrors?: Record<string, string> },
>(
  failure: TFailure,
): TFailure => {
  const rule = failure.fieldErrors?.addressText;
  if (!rule) {
    return failure;
  }

  return {
    ...failure,
    fieldErrors: {
      ...failure.fieldErrors,
      addressText: `warehouseDeliveryAddress.${keySuffixesByRule[rule] ?? 'invalid'}`,
    },
  };
};
