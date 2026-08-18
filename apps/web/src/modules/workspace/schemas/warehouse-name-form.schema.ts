import { warehouseWriteSchema } from '@warehouser/contracts/workspaces';
import { z } from 'zod';

// AC-08 shares one Warehouse Name value object server-side; the
// control-or-format-character rule is only ever detected server-side, so the
// browser only pre-checks trim/length here and leaves that rule, along with
// every other server rejection, to the mapped `workspace.invalid_input`
// response (see `useCreateWarehouse` / `useRenameWarehouse`).
export const warehouseNameValidationKeys = {
  required: 'warehouseName.required',
  length: 'warehouseName.lengthRange',
} as const;

const rawWarehouseNameFormSchema = z.object({ name: z.string() });

export const warehouseNameFormSchema = rawWarehouseNameFormSchema
  .superRefine((values, context) => {
    const trimmedName = values.name.trim();
    // Emptiness is checked here rather than through the contract schema: that
    // schema carries no lower bound, because the server raises the empty-name
    // rule from the shared name value object as `workspace.invalid_input`.
    const isEmpty = trimmedName.length === 0;
    const parsed = warehouseWriteSchema.safeParse({ name: trimmedName });
    if (!isEmpty && parsed.success) {
      return;
    }

    context.addIssue({
      code: 'custom',
      path: ['name'],
      message: isEmpty
        ? warehouseNameValidationKeys.required
        : warehouseNameValidationKeys.length,
    });
  })
  .transform((values) => ({ name: values.name.trim() }));

export type WarehouseNameFormValues = z.input<typeof warehouseNameFormSchema>;
