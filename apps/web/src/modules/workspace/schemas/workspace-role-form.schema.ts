import {
  workspacePermissionIdSchema,
  workspaceRoleWriteSchema,
} from '@warehouser/contracts/workspaces';
import { z } from 'zod';

// AC-15a — the Workspace Role name shares the one Name value object with the
// Workspace and the Warehouse (T4). The control-or-format-character rule is
// only ever detected server-side, so the browser pre-checks trim and length
// here and leaves every other rejection to the mapped `workspace.invalid_input`
// response (see `workspace-role-name-validation.ts`).
export const workspaceRoleNameValidationKeys = {
  required: 'workspaceRoleName.required',
  length: 'workspaceRoleName.lengthRange',
} as const;

const rawWorkspaceRoleFormSchema = z.object({
  name: z.string(),
  workspacePermissionIds: z.array(workspacePermissionIdSchema),
});

export const workspaceRoleFormSchema = rawWorkspaceRoleFormSchema
  .superRefine((values, context) => {
    const trimmedName = values.name.trim();
    const parsed = workspaceRoleWriteSchema.safeParse({
      ...values,
      name: trimmedName,
    });
    if (parsed.success) {
      return;
    }

    context.addIssue({
      code: 'custom',
      path: ['name'],
      message:
        trimmedName.length === 0
          ? workspaceRoleNameValidationKeys.required
          : workspaceRoleNameValidationKeys.length,
    });
  })
  .transform((values) => ({ ...values, name: values.name.trim() }));

export type WorkspaceRoleFormValues = z.input<typeof workspaceRoleFormSchema>;
