import { ErrorCode } from '@warehouser/shared-types/enums';
import { useCallback } from 'react';

import { useCreateMemberMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { CreateMemberInput } from '@warehouser/contracts/users';
import type { FieldErrorMap } from 'modules/access/api/access-mutation';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

export type CreateMember = (
  input: CreateMemberInput,
) => Promise<MutationOutcome>;

/** Which field explains a rejected creation when the server named no field. */
const fieldErrorsByCode: Record<string, Record<string, string>> = {
  [ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED]: { email: 'duplicate' },
  [ErrorCode.USERS_PERMISSION_EXCEEDED]: { roleId: 'exceeded' },
  [ErrorCode.USERS_RESERVED_ROLE_SELECTION]: { roleId: 'exceeded' },
};

const fieldErrorsFor: FieldErrorMap = (code) => fieldErrorsByCode[code];

/** Adds a member to the named Warehouse with an initial password and Role. */
export const useCreateMember = (warehouseId: string): CreateMember => {
  const [createMember] = useCreateMemberMutation();

  return useCallback(
    (input) =>
      runAccessMutation(
        'createMember',
        createMember({ warehouseId, input }),
        fieldErrorsFor,
      ),
    [createMember, warehouseId],
  );
};
