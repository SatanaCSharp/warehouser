import { AccessName } from 'shared/domain/value-objects/access-name';

/**
 * A Workspace's name, which — unlike a Warehouse or Role name — has a legitimate
 * unset state: a Workspace is created without a name at registration and is
 * presented with a placeholder until a member names it (AC-29).
 *
 * Naming obeys exactly the same rules as every other name in the system, so the
 * rules live in {@link AccessName} and this wrapper only adds the unset state.
 */
export class WorkspaceName {
  private constructor(private readonly name: AccessName | null) {}

  static unset(): WorkspaceName {
    return new WorkspaceName(null);
  }

  static create(input: string): WorkspaceName {
    return new WorkspaceName(AccessName.create(input));
  }

  /**
   * Rebuilds the value from what persistence holds, where a null column is the
   * unnamed state. Stored names are already trimmed and validated, but they are
   * re-validated here so a name that predates a rule change cannot enter the
   * domain unchecked.
   */
  static fromStored(stored: string | null): WorkspaceName {
    return stored === null
      ? WorkspaceName.unset()
      : WorkspaceName.create(stored);
  }

  get isSet(): boolean {
    return this.name !== null;
  }

  get value(): string | null {
    return this.name?.value ?? null;
  }
}
