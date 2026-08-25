import type { z } from 'zod';

type NamedValues = { name: string };

/**
 * The browser-side pre-check every Name field shares.
 *
 * Workspace, Workspace Role and Warehouse names are one server-side value
 * object, and the control-or-format-character rule is only ever detected
 * server-side — so each form pre-checks trim and length here and leaves every
 * other rejection to the mapped `workspace.invalid_input` response
 * (`shared/utils/name-validation.ts`).
 *
 * Emptiness is checked here rather than through the contract schema: that
 * schema carries no lower bound, because the server raises the empty-name rule
 * from the shared value object instead.
 *
 * @param contract the request schema the trimmed values must satisfy
 * @param prefix the validation-key namespace of the field, such as `warehouseName`
 */
export const refineName =
  <TValues extends NamedValues>(contract: z.ZodType, prefix: string) =>
  (values: TValues, context: z.RefinementCtx): void => {
    const name = values.name.trim();
    const isEmpty = name.length === 0;
    if (!isEmpty && contract.safeParse({ ...values, name }).success) {
      return;
    }

    context.addIssue({
      code: 'custom',
      path: ['name'],
      message: isEmpty ? `${prefix}.required` : `${prefix}.lengthRange`,
    });
  };

/** Commits the trim the pre-check validated, so the request carries it. */
export const trimName = <TValues extends NamedValues>(
  values: TValues,
): TValues => ({ ...values, name: values.name.trim() });
