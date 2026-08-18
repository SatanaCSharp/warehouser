import { workspaceRenameSchema } from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { refineName, trimName } from 'shared/utils/name-form';

/** AC-29a — the browser pre-check of the one Workspace Name value object. */
export const nameWorkspaceFormSchema = z
  .object({ name: z.string() })
  .superRefine(refineName(workspaceRenameSchema, 'workspaceName'))
  .transform(trimName);

export type NameWorkspaceFormValues = z.input<typeof nameWorkspaceFormSchema>;
