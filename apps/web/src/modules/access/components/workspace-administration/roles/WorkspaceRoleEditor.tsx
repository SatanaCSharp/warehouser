import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useUpdateWorkspaceRoleMutation } from 'modules/access/api/workspace-roles-api';
import { DeleteWorkspaceRoleAction } from 'modules/access/components/workspace-administration/roles/DeleteWorkspaceRoleAction';
import { WorkspacePermissionFieldset } from 'modules/access/components/workspace-administration/roles/WorkspacePermissionFieldset';
import { useWorkspaceRoleForm } from 'modules/access/hooks/forms/useWorkspaceRoleForm';
import { useWorkspacePermissionCatalogue } from 'modules/access/hooks/queries/useWorkspacePermissionCatalogue';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

import type {
  WorkspaceRole,
  WorkspaceRoleWrite,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type WorkspaceRoleEditorProps = {
  replacements: WorkspaceRole[];
  role: WorkspaceRole;
};

/**
 * Editor for the selected Workspace Role. It seeds itself from `role` once —
 * the directory keys it by Role id, so selecting another Role mounts a fresh
 * editor instead of resetting this one.
 *
 * The protected Workspace Owner Role shows every Permission granted and
 * locked, offers no rename, no delete and no save, and says that it is
 * system-managed rather than leaving the missing controls unexplained (AC-16).
 *
 * `WORKSPACE_ROLES:UPDATE` is read here rather than handed down as a boolean,
 * and it is read with `useHasWorkspacePermission` rather than
 * `WorkspacePermissionGate` because the answer feeds `isDisabled` on the
 * Permission fieldset as well as deciding which controls render
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * The Permission catalogue is read here for the same reason: this is the
 * component that grants from it. The read owns its own skip condition and RTK
 * Query serves every caller from one cache entry, so reading it beside the
 * fieldset costs no extra request and keeps the Roles tab from threading the
 * catalogue through the directory on its way here.
 */
export const WorkspaceRoleEditor = ({
  replacements,
  role,
}: WorkspaceRoleEditorProps): ReactElement => {
  const { t } = useTranslation('access');
  const [updateWorkspaceRole] = useUpdateWorkspaceRoleMutation();
  const { permissions } = useWorkspacePermissionCatalogue();
  const canUpdate = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
  );
  const isProtected = role.kind === 'workspace_owner';
  const isEditable = canUpdate && !isProtected;

  const onSave = (input: WorkspaceRoleWrite): Promise<MutationResult> =>
    updateWorkspaceRole({ workspaceRoleId: role.id, ...input });

  const { control, errors, isSubmitting, register, reset, submit } =
    useWorkspaceRoleForm({
      defaultValues: {
        name: role.name,
        workspacePermissionIds: role.workspacePermissionIds,
      },
      onSave,
    });

  const onDiscard = (): void => reset();

  return (
    <form
      aria-label={t('workspaceRoles.editor.regionLabel')}
      className="rounded-xl border border-border bg-surface p-5 sm:p-6"
      noValidate
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{role.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {isProtected
              ? t('workspaceRoles.protectedReason')
              : t('workspaceRoles.editor.subtitle', {
                  count: role.assignedMemberCount,
                })}
          </p>
        </div>
      </div>

      <Conditional when={isEditable}>
        <FormTextField
          className="mt-5"
          isRequired
          validationBehavior="aria"
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name?.message}
          defaultValue={role.name}
          isDisabled={isSubmitting}
          label={t('workspaceRoles.editor.nameLabel')}
          description={t('workspaceRoles.editor.nameDescription')}
          {...register('name')}
        />
      </Conditional>

      <div className="mt-6">
        <Controller
          control={control}
          name="workspacePermissionIds"
          render={({ field }) => (
            <WorkspacePermissionFieldset
              isDisabled={!isEditable}
              permissions={permissions}
              selectedIds={
                isProtected
                  ? permissions.map((permission) => permission.id)
                  : field.value
              }
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {/* Soft-danger delete on the left, Cancel then the primary on the right
          (design-handoff.md §Component mapping, `AmkoM`). */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <DeleteWorkspaceRoleAction replacements={replacements} role={role} />
        </div>
        <Conditional when={isEditable}>
          <div className="flex gap-2">
            <Button
              isDisabled={isSubmitting}
              size="sm"
              variant="ghost"
              onPress={onDiscard}
            >
              {t('workspaceRoles.editor.cancel')}
            </Button>
            <Button
              className="font-semibold"
              isPending={isSubmitting}
              size="sm"
              type="submit"
              variant="primary"
            >
              {t('workspaceRoles.editor.save')}
            </Button>
          </div>
        </Conditional>
      </div>
    </form>
  );
};
