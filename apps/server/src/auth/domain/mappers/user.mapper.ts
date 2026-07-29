import { User } from 'auth/domain/entities/user';
import { UserEntity } from 'shared/domain/entities/user.entity';

export const toUserEntity = (
  user: User,
  createdAt: Date,
): Partial<UserEntity> => ({
  id: user.id.value,
  accountId: user.accountId.value,
  createdAt,
  updatedAt: createdAt,
});
