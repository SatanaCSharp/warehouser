import {
  workspacePermissionIdSchema,
  workspaceRoleWriteSchema,
} from '@warehouser/contracts/workspaces';
import { refineName, trimName } from 'shared/utils/name-form';
import { z } from 'zod';

/** AC-15a — the browser pre-check of the one Workspace Role Name value object. */
export const workspaceRoleFormSchema = z
  .object({
    name: z.string(),
    workspacePermissionIds: z.array(workspacePermissionIdSchema),
  })
  .superRefine(refineName(workspaceRoleWriteSchema, 'workspaceRoleName'))
  .transform(trimName);

export type WorkspaceRoleFormValues = z.input<typeof workspaceRoleFormSchema>;
