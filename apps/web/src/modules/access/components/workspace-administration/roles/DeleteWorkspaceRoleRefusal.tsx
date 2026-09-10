import { Alert } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

type DeleteWorkspaceRoleRefusalProps = {
  /**
   * The Role is assigned and no replacement can exist, because it is the
   * Workspace's only custom Workspace Role (AC-17c). Known before the member
   * is asked to choose anything, so it is stated rather than discovered.
   */
  hasNoReplacement: boolean;
  /** The stable code of the server's refusal, once the deletion was attempted. */
  code?: string;
};

/**
 * A server error code is an identifier, never display text
 * (web-error-handling.md §1, §5), so each refusal this deletion can meet is
 * mapped to translated copy with a lookup rather than an `if` chain. Anything
 * unmapped stays with the generic error toast the global middleware owns (§2).
 */
const refusalCopyByCode: Record<string, string> = {
  // Moving the members holding the Role to a replacement is a Workspace Role
  // assignment, so `WORKSPACE_ROLES:ASSIGN` is required on top of DELETE
  // (AC-17d).
  'workspace.role_assignment_required': 'assignmentRefusal',
  // The Role is the Workspace's only custom Workspace Role (AC-17c) — reached
  // when another member removed the last replacement mid-session.
  'workspace.replacement_role_required': 'onlyCustomRefusal',
};

/**
 * Explains why deleting this Workspace Role cannot proceed, in the dialog where
 * the deletion was chosen. It renders nothing until a refusal actually applies.
 */
export const DeleteWorkspaceRoleRefusal = ({
  code,
  hasNoReplacement,
}: DeleteWorkspaceRoleRefusalProps): ReactElement | null => {
  const { t } = useTranslation('access');
  const copyKey = hasNoReplacement
    ? 'onlyCustomRefusal'
    : refusalCopyByCode[code ?? ''];

  if (!copyKey) {
    return null;
  }

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t(`workspaceRoles.delete.${copyKey}.title`)}</Alert.Title>
        <Alert.Description>
          {t(`workspaceRoles.delete.${copyKey}.description`)}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};
