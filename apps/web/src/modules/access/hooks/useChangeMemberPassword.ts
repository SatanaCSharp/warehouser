import { ErrorCode } from '@warehouser/shared-types/enums';
import { useCallback } from 'react';

import { useChangeMemberPasswordMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { PasswordChangeInput } from '@warehouser/contracts/users';
import type { FieldErrorMap } from 'modules/access/api/access-mutation';
import type { MutationOutcome } from 'modules/access/types/access.types';

export type ChangeMemberPassword = (
  userId: string,
  input: PasswordChangeInput,
) => Promise<MutationOutcome>;

/** Every rejection of a password reset is explained on the password field. */
const fieldErrorsByCode: Record<string, Record<string, string>> = {
  [ErrorCode.USERS_MANAGER_ROLE_PROTECTED]: { password: 'protected' },
  [ErrorCode.USERS_PERMISSION_EXCEEDED]: { password: 'exceeded' },
};

const fieldErrorsFor: FieldErrorMap = (code) => fieldErrorsByCode[code];

/** Sets a new password for one member. */
export const useChangeMemberPassword = (): ChangeMemberPassword => {
  const [changeMemberPassword] = useChangeMemberPasswordMutation();

  return useCallback(
    (userId, input) =>
      runAccessMutation(
        'changeMemberPassword',
        changeMemberPassword({ userId, input }),
        fieldErrorsFor,
      ),
    [changeMemberPassword],
  );
};
