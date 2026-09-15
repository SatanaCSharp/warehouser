import { Alert } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

type WorkspaceRefusalAlertProps = { code?: string };

/**
 * A server error code is an identifier, never display text
 * (web-error-handling.md §1, §5), so the refusals a member can act on are
 * mapped to translated copy with a lookup rather than an `if` chain. Anything
 * unmapped stays with the generic error toast the global middleware owns (§2).
 */
const refusalCopyByCode: Record<string, string> = {
  // The Workspace Role the actor was relying on changed mid-session: explain it
  // safely and disclose nothing about the target (design-handoff.md §States,
  // `OD62T`). The Workspace context is refreshed by the write's own tags.
  // This one refusal is the administration shell's own state copy, so it stays
  // in `workspace.json` while the membership copy lives in `access.json`; the
  // lookup is the single place that difference is expressed.
  'workspace.denied': 'workspace:states.authorityLost',
  // The outgoing Owner has no custom Workspace Role to receive (AC-26a).
  'workspace.replacement_role_required':
    'access:workspaceMembers.transferOwnership.refusal',
};

/**
 * Explains a refusal where the choice that provoked it was made. It renders
 * nothing until a refusal the member can act on actually arrives.
 */
export const WorkspaceRefusalAlert = ({
  code,
}: WorkspaceRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation(['access', 'workspace']);
  const copyKey = code === undefined ? undefined : refusalCopyByCode[code];

  if (!copyKey) {
    return null;
  }

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t(`${copyKey}.title`)}</Alert.Title>
        <Alert.Description>{t(`${copyKey}.description`)}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
};
