import { ErrorCode } from '@warehouser/shared-types/enums';
import { useCallback } from 'react';

import { useChangeMemberEmailMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { EmailChangeInput } from '@warehouser/contracts/users';
import type { FieldErrorMap } from 'modules/access/api/access-mutation';
import type { MutationOutcome } from 'modules/access/types/access.types';

export type ChangeMemberEmail = (
  userId: string,
  input: EmailChangeInput,
) => Promise<MutationOutcome>;

/** Every rejection of an email change is explained on the email field. */
const fieldErrorsByCode: Record<string, Record<string, string>> = {
  [ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED]: { email: 'duplicate' },
  [ErrorCode.USERS_MANAGER_ROLE_PROTECTED]: { email: 'protected' },
  [ErrorCode.USERS_PERMISSION_EXCEEDED]: { email: 'exceeded' },
};

const fieldErrorsFor: FieldErrorMap = (code) => fieldErrorsByCode[code];

/** Replaces one member's sign-in email, within the named Warehouse (AC-05). */
export const useChangeMemberEmail = (
  warehouseId: string,
): ChangeMemberEmail => {
  const [changeMemberEmail] = useChangeMemberEmailMutation();

  return useCallback(
    (userId, input) =>
      runAccessMutation(
        'changeMemberEmail',
        changeMemberEmail({ warehouseId, userId, input }),
        fieldErrorsFor,
      ),
    [changeMemberEmail, warehouseId],
  );
};
