import {
  workspacePermissionIdSchema,
  workspaceSchema,
} from 'workspaces/workspaces-projections';
import { z } from 'zod';

interface GraphemeSegmenter {
  segment(value: string): Iterable<unknown>;
}

interface GraphemeSegmenterConstructor {
  new (
    locale?: string,
    options?: { readonly granularity: 'grapheme' },
  ): GraphemeSegmenter;
}

const GraphemeSegmenter = (
  Intl as unknown as { readonly Segmenter: GraphemeSegmenterConstructor }
).Segmenter;
const graphemeSegmenter = new GraphemeSegmenter(undefined, {
  granularity: 'grapheme',
});

const emailPattern =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

const normalizedEmailSchema = z
  .string()
  .transform((email) => email.trim().toLowerCase())
  .pipe(z.string().max(254).regex(emailPattern));

const passwordSchema = z.string().superRefine((password, context) => {
  const length = Array.from(password).length;

  if (length < 8 || length > 128) {
    context.addIssue({
      code: 'custom',
      message: 'Password must contain 8 to 128 Unicode code points.',
    });
  }
});

const warehouseNameSchema = z
  .string()
  .transform((name) => name.trim())
  .superRefine((name, context) => {
    const graphemeCount = Array.from(graphemeSegmenter.segment(name)).length;
    if (graphemeCount < 1 || graphemeCount > 100) {
      context.addIssue({
        code: 'custom',
        message:
          'Warehouse name must contain 1 to 100 user-perceived characters.',
      });
    }
    if (/[\p{Cc}\p{Cf}]/u.test(name)) {
      context.addIssue({
        code: 'custom',
        message:
          'Warehouse name must not contain control or format characters.',
      });
    }
  });

export const authCredentialsSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
  })
  .strict();

export const registrationInputSchema = authCredentialsSchema.extend({
  warehouseName: warehouseNameSchema,
});

export const userSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const authenticatedUserSchema = z
  .object({
    user: userSchema,
  })
  .strict();

export const accessProjectionSchema = z
  .object({
    warehouseId: z.string().uuid(),
    roleId: z.string().uuid(),
    roleKind: z.enum(['custom', 'warehouse_manager']),
    permissionIds: z.array(
      z
        .string()
        .max(64)
        .regex(/^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/u),
    ),
    // The Warehouse's archived state, so the shell renders a retained
    // Warehouse read-only rather than offering mutations the guard refuses
    // (AC-12, AC-12a). Always `null` at registration — the Warehouse was
    // created by the same outcome — but the field is required, so the shell
    // reads one shape wherever the projection comes from.
    archivedAt: z.string().datetime().nullable(),
  })
  .strict();

// AC-01 — registration creates the Workspace and its first Warehouse as one
// outcome, and the response carries the initial Workspace projection
// alongside the Warehouse one so the shell needs no second round trip.
export const registrationResultSchema = z
  .object({
    user: userSchema,
    workspace: workspaceSchema,
    workspacePermissionIds: z.array(workspacePermissionIdSchema),
    access: accessProjectionSchema,
    // AC-03b — the sole Warehouse membership registration creates is the
    // effective selection with no one choosing, so this is never absent.
    effectiveWarehouseId: z.string().uuid(),
  })
  .strict();

export const errorResponseSchema = z
  .object({
    code: z.string().regex(/^[a-z_]+\.[a-z_]+$/u),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type RegistrationInput = z.infer<typeof registrationInputSchema>;
export type RegistrationResult = z.infer<typeof registrationResultSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
