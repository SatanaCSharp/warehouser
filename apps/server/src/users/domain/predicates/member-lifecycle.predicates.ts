export const isSelfAction = (actorId: string, targetId: string): boolean =>
  actorId === targetId;

export const isProtectedManagerTarget = (targetRoleKind: string): boolean =>
  targetRoleKind === 'warehouse_manager';

export const exceedsActorPermissions = (
  actorPermissions: string[],
  candidatePermissions: string[],
): boolean =>
  candidatePermissions.some(
    (permission) => !actorPermissions.includes(permission),
  );

export const isReservedManagerRoleSelection = (
  selectedRoleKind: string,
): boolean => selectedRoleKind === 'warehouse_manager';
