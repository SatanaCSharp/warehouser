import { useTranslation } from 'react-i18next';

import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { useAppSelector } from 'store/hooks';

/**
 * How a Purchase Draft names the member who acted on it.
 *
 * **The actor is named as "you", or not named at all.** This system models no
 * person name: `users` carries no name column and a member is identified only
 * by an optional email, so the approved frames' "Made ready by Iryna Kovalenko"
 * is not renderable from anything on the wire, and inventing a display name
 * would be inventing data. The acting user's own id resolves to "you"; every
 * other id — and a missing one — resolves to the neutral fallback the copy
 * files carry.
 */
export const useDraftActorName = (): ((actorId: string | null) => string) => {
  const { t } = useTranslation('purchase-draft');
  const actingUser = useAppSelector(selectCurrentUser);

  return (actorId) =>
    t(
      actorId !== null && actorId === actingUser?.id
        ? 'attribution.you'
        : 'attribution.anotherMember',
    );
};
