import { assert } from '@warehouser/utils/asserts';

export type PermissionKind = 'assignable' | 'reserved';

export class Permission {
  private constructor(
    readonly id: string,
    readonly label: string,
    readonly kind: PermissionKind,
  ) {
    assert(
      /^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/u.test(id),
      'Permission identifier is invalid',
    );
    assert(label.trim().length > 0, 'Permission label must not be empty');
  }

  static assignable(id: string, label: string): Permission {
    return new Permission(id, label, 'assignable');
  }

  static reserved(id: string, label: string): Permission {
    return new Permission(id, label, 'reserved');
  }

  get isAssignable(): boolean {
    return this.kind === 'assignable';
  }
}
