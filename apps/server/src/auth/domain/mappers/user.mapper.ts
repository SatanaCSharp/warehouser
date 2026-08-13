import { User } from 'auth/domain/entities/user';
import { UserEntity } from 'shared/domain/entities/user.entity';

export const toUserEntity = (
  user: User,
  createdAt: Date,
  workspaceId: string,
): Partial<UserEntity> => ({
  id: user.id.value,
  accountId: user.accountId.value,
  workspaceId,
  createdAt,
  updatedAt: createdAt,
});
