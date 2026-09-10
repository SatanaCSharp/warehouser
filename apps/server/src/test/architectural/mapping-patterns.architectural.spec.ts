import {
  findMappingDeclarations,
  type MappingPattern,
  serverMappingDeclarations,
} from 'test/architectural/mapping-patterns.js';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

/** The control on `mapper-placement.architectural.spec.ts`.
 *
 * A placement gate is only worth the run time if the detector behind it actually sees mappings: one
 * that recognizes nothing passes every placement assertion and reports a clean tree while a response
 * mapper sits in a controller. So each pattern is exercised on a fixture written the way the
 * repository writes it, each shape that is *not* a mapping is exercised too — a predicate, a value
 * object's factory, a use case's own `execute` — and the real source tree is asserted to still
 * contain the mappings we know are in it. */

const patternsOf = (
  source: string,
  name: string,
): readonly MappingPattern[] => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('/fixture.ts', source);
  const found = findMappingDeclarations([file]).find(
    (mapping) => mapping.name === name,
  );

  return found?.patterns ?? [];
};

const detects = (source: string, name: string): boolean =>
  patternsOf(source, name).length > 0;

describe('mapping detection', () => {
  it('sees an object projection built out of a persistence entity', () => {
    expect(
      patternsOf(
        `
        interface CustomerEntity { id: string; name: string; }
        export const toCustomer = (entity: CustomerEntity) => ({
          id: entity.id,
          name: entity.name,
        });
        `,
        'toCustomer',
      ),
    ).toContain('object-projection');
  });

  it('sees a collection projection, spelled as a method and as lodash', () => {
    expect(
      patternsOf(
        `
        interface LineRead { id: string; }
        export const toLines = (lines: readonly LineRead[]) =>
          lines.map((line) => ({ id: line.id }));
        `,
        'toLines',
      ),
    ).toContain('collection-projection');

    expect(
      patternsOf(
        `
        import map from 'lodash/map.js';
        interface LineRead { id: string; }
        export const toLines = (lines: readonly LineRead[]) =>
          map(lines, (line) => ({ id: line.id }));
        `,
        'toLines',
      ),
    ).toContain('collection-projection');
  });

  it('sees a persistence row being constructed', () => {
    expect(
      patternsOf(
        `
        class SessionEntity { id!: string; }
        export const toSessionEntity = (session: { id: string }) => {
          const entity = new SessionEntity();
          entity.id = session.id;

          return entity;
        };
        `,
        'toSessionEntity',
      ),
    ).toContain('entity-construction');
  });

  it('sees a persistence row created through the entity manager', () => {
    expect(
      patternsOf(
        `
        class ItemEntity { id!: string; }
        declare const manager: { create(target: unknown, plain: unknown): ItemEntity };
        export const toItemEntity = (item: { id: string }) =>
          manager.create(ItemEntity, { id: item.id });
        `,
        'toItemEntity',
      ),
    ).toContain('entity-construction');
  });

  it('sees fields handed to a domain factory', () => {
    expect(
      patternsOf(
        `
        interface AccountEntity { id: string; email: string; }
        declare const Account: { create(input: { id: string; email: string }): unknown };
        export const toAccount = (entity: AccountEntity) =>
          Account.create({ id: entity.id, email: entity.email });
        `,
        'toAccount',
      ),
    ).toContain('factory-construction');
  });

  it('sees a conversion that branches into two shapes', () => {
    expect(
      patternsOf(
        `
        interface OrderProjection { id: string; customer: string | null; }
        export const toOrderResponse = (order: OrderProjection) =>
          order.customer === null
            ? { id: order.id }
            : { id: order.id, customer: order.customer };
        `,
        'toOrderResponse',
      ),
    ).toContain('branching-projection');
  });

  it('sees a conversion that delegates to other mappings', () => {
    expect(
      patternsOf(
        `
        interface OrderProjection { id: string; identified: boolean; }
        const toRedactedResponse = (order: OrderProjection) => ({ id: order.id });
        const toIdentifiedResponse = (order: OrderProjection) => ({
          id: order.id,
          identified: order.identified,
        });
        export const toOrderResponse = (order: OrderProjection) =>
          order.identified ? toIdentifiedResponse(order) : toRedactedResponse(order);
        `,
        'toOrderResponse',
      ),
    ).toContain('delegating-conversion');
  });

  it('sees a conversion declared to return a published contract, whatever its body does', () => {
    expect(
      patternsOf(
        `
        import type { Customer } from '@warehouser/contracts/customers';
        declare const cache: Map<string, Customer>;
        export const toCustomerResponse = (id: string): Customer => cache.get(id)!;
        `,
        'toCustomerResponse',
      ),
    ).toContain('contract-typed-conversion');
  });
});

describe('mapping detection, wherever the mapping is written', () => {
  it('sees a mapping hidden in a class, however the class spells it', () => {
    expect(
      detects(
        `
        interface ItemEntity { id: string; sku: string; }
        export class ItemsController {
          private toItemResponse(entity: ItemEntity) {
            return { id: entity.id, sku: entity.sku };
          }
        }
        `,
        'toItemResponse',
      ),
    ).toBe(true);

    expect(
      detects(
        `
        interface ItemEntity { id: string; sku: string; }
        export class ItemsController {
          private readonly toItemResponse = (entity: ItemEntity) => ({
            id: entity.id,
            sku: entity.sku,
          });
        }
        `,
        'toItemResponse',
      ),
    ).toBe(true);
  });

  it('sees a mapping declared inside the function that uses it', () => {
    expect(
      detects(
        `
        interface ItemEntity { id: string; sku: string; }
        export const listItems = (entities: readonly ItemEntity[]) => {
          const toItemResponse = (entity: ItemEntity) => ({
            id: entity.id,
            sku: entity.sku,
          });

          return entities.map(toItemResponse);
        };
        `,
        'toItemResponse',
      ),
    ).toBe(true);
  });

  it('reports whether the declaring file also calls the mapping', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      '/fixture.ts',
      `
      interface ItemEntity { id: string; }
      const toItemResponse = (entity: ItemEntity) => ({ id: entity.id });
      const toDetailResponse = (entity: ItemEntity) => ({ item: toItemResponse(entity) });
      export const toListResponse = (entity: ItemEntity) => ({ id: entity.id });
      `,
    );
    const found = findMappingDeclarations([file]);

    expect(
      found.find((mapping) => mapping.name === 'toItemResponse')
        ?.usedInDeclaringFile,
    ).toBe(true);
    expect(
      found.find((mapping) => mapping.name === 'toListResponse')
        ?.usedInDeclaringFile,
    ).toBe(false);
  });
});

describe('mapping detection, and what it leaves alone', () => {
  it('leaves alone what only looks like a mapping', () => {
    // A predicate: it answers a question about the row, it does not restate it.
    expect(
      detects(
        `
        interface OrderEntity { cancelledAt: Date | null; }
        export const isCancelled = (entity: OrderEntity) => entity.cancelledAt !== null;
        `,
        'isCancelled',
      ),
    ).toBe(false);

    // A value object's own factory: the type it returns is the domain concept itself.
    expect(
      detects(
        `
        export class WorkspaceName {
          private constructor(readonly value: string) {}
          static fromStored(stored: string): WorkspaceName {
            return new WorkspaceName(stored);
          }
        }
        `,
        'fromStored',
      ),
    ).toBe(false);

    // A use case's own output. `execute` composing its result is the use case, not a mapper
    // someone hid in it — the mapping it calls is what this rule is about.
    expect(
      detects(
        `
        import type { MemberPage } from '@warehouser/contracts/access';
        export class ListMembersQuery {
          async execute(limit: number): Promise<MemberPage> {
            return { items: [], hasMore: limit > 0 };
          }
        }
        `,
        'execute',
      ),
    ).toBe(false);

    // A classification of a driver result. Nothing is being restated in another shape.
    expect(
      detects(
        `
        export type WriteOutcome = 'applied' | 'unavailable';
        const toWriteOutcome = (affected: number | null): WriteOutcome =>
          affected === 1 ? 'applied' : 'unavailable';
        `,
        'toWriteOutcome',
      ),
    ).toBe(false);

    // A builder with no boundary in its signature: neither named nor typed as a conversion.
    expect(
      detects(
        `
        export const paginatablePage = <T>(items: readonly T[], limit: number) => ({
          items: items.slice(0, limit),
          hasMore: items.length > limit,
        });
        `,
        'paginatablePage',
      ),
    ).toBe(false);
  });
});

describe('mapping detection, against the server itself', () => {
  it('still finds the mappings the server is known to hold', () => {
    const byName = new Map(
      serverMappingDeclarations().map((mapping) => [mapping.name, mapping]),
    );

    // One of each pattern, taken from the tree itself: if a refactor makes the detector blind to a
    // shape, the placement gate above must not quietly go green with it.
    expect(byName.get('toCustomer')?.path).toBe(
      'src/customers/domain/mappers/customer.mapper.ts',
    );
    expect(byName.get('toSessionEntity')?.path).toBe(
      'src/auth/domain/mappers/session.mapper.ts',
    );
    expect(byName.get('toAccount')?.patterns).toContain('factory-construction');
    expect(byName.get('toEndingRejectionInputs')?.patterns).toContain(
      'collection-projection',
    );
    expect(byName.get('toReviseLineInput')?.path).toBe(
      'src/purchase-drafts/rest/mappers/purchase-draft-request.mapper.ts',
    );
    expect(byName.size).toBeGreaterThanOrEqual(20);
  });
});
