import { workspaceRenameSchema } from '@warehouser/contracts/workspaces';
import { z } from 'zod';

// AC-08 / AC-15a / AC-29a share one Name value object server-side; the
// control-or-format-character rule is only ever detected server-side (T4), so
// the browser only pre-checks trim/length here and leaves that rule, along
// with every other server rejection, to the mapped `workspace.invalid_input`
// response (see `useRenameWorkspace`).
export const nameWorkspaceValidationKeys = {
  required: 'workspaceName.required',
  length: 'workspaceName.lengthRange',
} as const;

const rawNameWorkspaceFormSchema = z.object({ name: z.string() });

export const nameWorkspaceFormSchema = rawNameWorkspaceFormSchema
  .superRefine((values, context) => {
    const trimmedName = values.name.trim();
    const parsed = workspaceRenameSchema.safeParse({ name: trimmedName });
    if (parsed.success) {
      return;
    }

    context.addIssue({
      code: 'custom',
      path: ['name'],
      message:
        trimmedName.length === 0
          ? nameWorkspaceValidationKeys.required
          : nameWorkspaceValidationKeys.length,
    });
  })
  .transform((values) => ({ name: values.name.trim() }));

export type NameWorkspaceFormValues = z.input<typeof nameWorkspaceFormSchema>;
