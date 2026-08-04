/* eslint-disable @typescript-eslint/no-use-before-define -- Dialog implementations follow the orchestrator they support. */
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { roleWriteSchema } from '@warehouser/contracts/access';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
  RoleWrite,
} from '@warehouser/contracts/access';
import type { FormEvent, ReactElement } from 'react';

type Role = RolePage['items'][number];
export type MutationOutcome = {
  success: boolean;
  fieldErrors?: Record<string, string>;
};
type AccessAdministrationProps = {
  access: AccessProjection;
  members: MemberPage['items'];
  permissions: PermissionPage['items'];
  roles: RolePage['items'];
  onAssignRole: (userId: string, roleId: string) => Promise<MutationOutcome>;
  onDeleteRole: (
    roleId: string,
    replacementRoleId: string | null,
  ) => Promise<MutationOutcome>;
  onSaveRole: (input: RoleWrite, roleId?: string) => Promise<MutationOutcome>;
  onTransferManager: (
    recipientUserId: string,
    formerManagerRoleId: string,
  ) => Promise<MutationOutcome>;
};

type Workflow =
  | { kind: 'assign'; memberId: string }
  | { kind: 'delete'; role: Role }
  | { kind: 'role'; role?: Role }
  | { kind: 'transfer' }
  | null;

// eslint-disable-next-line max-lines-per-function -- This orchestrator owns the four coupled access dialogs.
export const AccessAdministration = ({
  access,
  members,
  permissions,
  roles,
  onAssignRole,
  onDeleteRole,
  onSaveRole,
  onTransferManager,
}: AccessAdministrationProps): ReactElement => {
  const { t } = useTranslation('access');
  const [workflow, setWorkflow] = useState<Workflow>(null);
  const [announcement, setAnnouncement] = useState('');
  const customRoles = useMemo(
    () => roles.filter((role) => role.kind === 'custom'),
    [roles],
  );
  const can = (permission: string): boolean =>
    access.permissionIds.includes(permission);
  const close = (): void => setWorkflow(null);

  return (
    <section aria-labelledby="access-administration-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="access-administration-heading"
          className="text-xl font-semibold"
        >
          {t('administration.heading')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {can(PermissionId.ROLES_CREATE) ? (
            <Button
              color="primary"
              onPress={() => setWorkflow({ kind: 'role' })}
            >
              {t('administration.createRole')}
            </Button>
          ) : null}
          {can(PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN) ? (
            <Button
              variant="bordered"
              onPress={() => setWorkflow({ kind: 'transfer' })}
            >
              {t('administration.transfer.open')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <article
            className="rounded-medium border border-divider p-4"
            key={role.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">{role.name}</h3>
                {role.kind === 'warehouse_manager' ? (
                  <p className="text-sm text-foreground-500">
                    {t('roles.protected')}
                  </p>
                ) : null}
              </div>
              {role.kind === 'custom' ? (
                <div className="flex gap-2">
                  {can(PermissionId.ROLES_UPDATE) ? (
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => setWorkflow({ kind: 'role', role })}
                    >
                      {t('administration.editRole', { name: role.name })}
                    </Button>
                  ) : null}
                  {can(PermissionId.ROLES_DELETE) ? (
                    <Button
                      color="danger"
                      size="sm"
                      variant="light"
                      onPress={() => setWorkflow({ kind: 'delete', role })}
                    >
                      {t('administration.deleteRole', { name: role.name })}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {can(PermissionId.ROLES_ASSIGN) ? (
        <div className="mt-6 space-y-2">
          {members
            .filter((member) => member.roleKind !== 'warehouse_manager')
            .map((member) => (
              <div
                className="flex items-center justify-between gap-3 rounded-medium border border-divider p-3"
                key={member.userId}
              >
                <span className="font-mono text-sm">{member.userId}</span>
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={() =>
                    setWorkflow({ kind: 'assign', memberId: member.userId })
                  }
                >
                  {t('administration.assignment.open', {
                    userId: member.userId,
                  })}
                </Button>
              </div>
            ))}
        </div>
      ) : null}

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {workflow?.kind === 'role' ? (
        <RoleDialog
          permissions={permissions}
          role={workflow.role}
          onClose={close}
          onSave={async (input) => {
            const result = await onSaveRole(input, workflow.role?.id);
            if (!result.success) {
              return result;
            }
            setAnnouncement(
              t('administration.roleSaved', { name: input.name }),
            );
            close();
            return result;
          }}
        />
      ) : null}
      {workflow?.kind === 'assign' ? (
        <AssignmentDialog
          memberId={workflow.memberId}
          roles={customRoles}
          onClose={close}
          onSave={async (roleId) => {
            const result = await onAssignRole(workflow.memberId, roleId);
            if (!result.success) {
              return;
            }
            setAnnouncement(t('administration.assignment.saved'));
            close();
          }}
        />
      ) : null}
      {workflow?.kind === 'delete' ? (
        <DeletionDialog
          role={workflow.role}
          roles={customRoles}
          onClose={close}
          onDelete={async (replacementRoleId) => {
            const result = await onDeleteRole(
              workflow.role.id,
              replacementRoleId,
            );
            if (!result.success) {
              return;
            }
            const replacement = customRoles.find(
              (role) => role.id === replacementRoleId,
            );
            setAnnouncement(
              replacement
                ? t('administration.deletion.replaced', {
                    role: workflow.role.name,
                    replacement: replacement.name,
                  })
                : t('administration.deletion.deleted', {
                    role: workflow.role.name,
                  }),
            );
            close();
          }}
        />
      ) : null}
      {workflow?.kind === 'transfer' ? (
        <TransferDialog
          access={access}
          members={members}
          roles={customRoles}
          onClose={close}
          onTransfer={async (recipientId, replacementRoleId) => {
            const result = await onTransferManager(
              recipientId,
              replacementRoleId,
            );
            if (!result.success) {
              return;
            }
            setAnnouncement(t('administration.transfer.saved'));
            close();
          }}
        />
      ) : null}
    </section>
  );
};

const RoleDialog = ({
  permissions,
  role,
  onClose,
  onSave,
}: {
  permissions: PermissionPage['items'];
  role?: Role;
  onClose: () => void;
  onSave: (input: RoleWrite) => Promise<MutationOutcome>;
}): ReactElement => {
  const { t } = useTranslation('access');
  const [name, setName] = useState(role?.name ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissionIds ?? []);
  const [nameError, setNameError] = useState('');
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const parsed = roleWriteSchema.safeParse({ name, permissionIds: selected });
    if (!parsed.success) {
      const trimmed = name.trim();
      setNameError(
        trimmed.length === 0
          ? t('administration.roleEditor.validation.required')
          : /[\p{Cc}\p{Cf}]/u.test(trimmed)
            ? t('administration.roleEditor.validation.characters')
            : t('administration.roleEditor.validation.length'),
      );
      return;
    }
    setNameError('');
    const result = await onSave(parsed.data);
    if (!result.success && result.fieldErrors?.name) {
      setNameError(t('administration.roleEditor.validation.server'));
    }
  };
  const title = role
    ? t('administration.roleEditor.editTitle')
    : t('administration.roleEditor.createTitle');
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        <form onSubmit={submit}>
          <ModalHeader>{title}</ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              isRequired
              validationBehavior="aria"
              isInvalid={Boolean(nameError)}
              errorMessage={nameError}
              label={t('administration.roleEditor.name')}
              value={name}
              onValueChange={setName}
            />
            <fieldset className="space-y-3">
              <legend className="font-medium">
                {t('administration.roleEditor.permissions')}
              </legend>
              {permissions.map((permission) => {
                const reserved = permission.kind === 'reserved';
                return (
                  <div key={permission.id}>
                    <Checkbox
                      isDisabled={reserved}
                      isSelected={selected.includes(permission.id)}
                      onValueChange={(checked) =>
                        setSelected(
                          checked
                            ? [...selected, permission.id]
                            : selected.filter((id) => id !== permission.id),
                        )
                      }
                    >
                      {permission.label}
                    </Checkbox>
                    {reserved ? (
                      <p className="ml-6 text-sm text-foreground-500">
                        {t('administration.roleEditor.reserved')}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit">
              {t('administration.roleEditor.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const AssignmentDialog = ({
  memberId,
  roles,
  onClose,
  onSave,
}: {
  memberId: string;
  roles: Role[];
  onClose: () => void;
  onSave: (roleId: string) => Promise<void>;
}): ReactElement => {
  const { t } = useTranslation('access');
  const [roleId, setRoleId] = useState('');
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onSave(roleId);
          }}
        >
          <ModalHeader>{t('administration.assignment.title')}</ModalHeader>
          <ModalBody>
            <label>
              {t('administration.assignment.role')}
              <select
                required
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
                className="mt-2 w-full rounded-medium border border-divider p-3"
              >
                <option value="">{t('administration.select')}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="font-mono text-sm">{memberId}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit">
              {t('administration.assignment.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const DeletionDialog = ({
  role,
  roles,
  onClose,
  onDelete,
}: {
  role: Role;
  roles: Role[];
  onClose: () => void;
  onDelete: (replacementRoleId: string | null) => Promise<void>;
}): ReactElement => {
  const { t } = useTranslation('access');
  const assigned = role.assignedMemberCount > 0;
  const [replacement, setReplacement] = useState('');
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onDelete(assigned ? replacement : null);
          }}
        >
          <ModalHeader>
            {t('administration.deletion.title', { role: role.name })}
          </ModalHeader>
          <ModalBody>
            {assigned ? (
              <label>
                {t('administration.deletion.replacement')}
                <select
                  required
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  className="mt-2 w-full rounded-medium border border-divider p-3"
                >
                  <option value="">{t('administration.select')}</option>
                  {roles
                    .filter((candidate) => candidate.id !== role.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <p>{t('administration.deletion.unassigned')}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="danger" type="submit">
              {assigned
                ? t('administration.deletion.replaceAndDelete')
                : t('administration.deletion.confirm')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const TransferDialog = ({
  access,
  members,
  roles,
  onClose,
  onTransfer,
}: {
  access: AccessProjection;
  members: MemberPage['items'];
  roles: Role[];
  onClose: () => void;
  onTransfer: (recipientId: string, replacementRoleId: string) => Promise<void>;
}): ReactElement => {
  const { t } = useTranslation('access');
  const currentManager = members.find(
    (member) => member.roleId === access.roleId,
  );
  const [recipient, setRecipient] = useState('');
  const [replacement, setReplacement] = useState('');
  const replacementRole = roles.find((role) => role.id === replacement);
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      size="lg"
    >
      <ModalContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onTransfer(recipient, replacement);
          }}
        >
          <ModalHeader>{t('administration.transfer.title')}</ModalHeader>
          <ModalBody>
            <label>
              {t('administration.transfer.recipient')}
              <select
                required
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                className="mt-2 w-full rounded-medium border border-divider p-3"
              >
                <option value="">{t('administration.select')}</option>
                {members
                  .filter((member) => member.roleKind !== 'warehouse_manager')
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.userId}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('administration.transfer.replacement')}
              <select
                required
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                className="mt-2 w-full rounded-medium border border-divider p-3"
              >
                <option value="">{t('administration.select')}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {recipient ? (
              <p>
                {t('administration.transfer.recipientSummary', {
                  userId: recipient,
                })}
              </p>
            ) : null}
            {currentManager && replacementRole ? (
              <p>
                {t('administration.transfer.managerSummary', {
                  userId: currentManager.userId,
                  role: replacementRole.name,
                })}
              </p>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit">
              {t('administration.transfer.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
