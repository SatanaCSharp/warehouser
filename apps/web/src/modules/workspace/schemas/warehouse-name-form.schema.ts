import { warehouseWriteSchema } from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { refineName, trimName } from 'shared/utils/name-form';

/** AC-08 — the browser pre-check of the one Warehouse Name value object. */
export const warehouseNameFormSchema = z
  .object({ name: z.string() })
  .superRefine(refineName(warehouseWriteSchema, 'warehouseName'))
  .transform(trimName);

export type WarehouseNameFormValues = z.input<typeof warehouseNameFormSchema>;
