import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import {
  admitsReads,
  resolveWarehouseEntry,
} from 'guards/warehouse-entry.guard';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { afterEach, describe, expect, it, vi } from 'vitest';

// CR-AC-07 / ADR 0001 §Neutral — `warehouseId` is never shape-validated ahead
// of the membership lookup, so a malformed value must be indistinguishable
// from a well-formed one the actor holds no membership in.
const OWN_MEMBER_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000010';
const OWN_ARCHIVED_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000011';
const OWN_NO_MEMBERSHIP_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000012';
const FOREIGN_WORKSPACE_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000099';
const NON_EXISTENT_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000000';
const MALFORMED_WAREHOUSE_ID = 'not-a-uuid';

const workspaceContext: WorkspaceContext = {
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [],
  warehouses: [
    {
      warehouseId: OWN_MEMBER_WAREHOUSE_ID,
      name: 'Live Warehouse',
      archivedAt: null,
      roleId: '00000000-0000-4000-8000-000000000020',
      roleKind: 'custom',
    },
    {
      warehouseId: OWN_ARCHIVED_WAREHOUSE_ID,
      name: 'Archived Warehouse',
      archivedAt: '2026-01-01T00:00:00.000Z',
      roleId: '00000000-0000-4000-8000-000000000021',
      roleKind: 'custom',
    },
  ],
  effectiveWarehouseId: OWN_MEMBER_WAREHOUSE_ID,
};

const makeContextForTest = (): {
  store: AppStore;
  fetchMock: ReturnType<typeof vi.fn>;
} => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(workspaceContext));
  vi.stubGlobal('fetch', fetchMock);
  const store = makeStore();
  return { store, fetchMock };
};

describe('resolveWarehouseEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['a non-existent id', NON_EXISTENT_WAREHOUSE_ID],
    ['a foreign-Workspace id', FOREIGN_WORKSPACE_WAREHOUSE_ID],
    ['an own-Workspace id with no membership', OWN_NO_MEMBERSHIP_WAREHOUSE_ID],
    ['a malformed id', MALFORMED_WAREHOUSE_ID],
  ])(
    'refuses with reason not-a-member for %s, echoing only the requested id',
    async (_label, warehouseId) => {
      const { store } = makeContextForTest();

      const verdict = await resolveWarehouseEntry({ store }, warehouseId);

      expect(verdict).toEqual({
        status: 'refused',
        reason: 'not-a-member',
        warehouseId,
      });
    },
  );

  it('reaches the membership lookup for a malformed id instead of short-circuiting on shape', async () => {
    const { store, fetchMock } = makeContextForTest();

    await resolveWarehouseEntry({ store }, MALFORMED_WAREHOUSE_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspace/context',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  // AC-23 supersedes CR-AC-17's outright refusal on this case: a member of an
  // archived Warehouse enters it read-only so their watch Permissions keep
  // reading exactly as before archiving. CR-AC-17's other half is unchanged and
  // asserted below — the archived reason is still named explicitly, so the
  // verdict stays distinguishable from CR-AC-07's non-disclosing refusal.
  it('enters read-only, naming the archived reason, for a membership in an archived Warehouse (AC-23, CR-AC-17)', async () => {
    const { store } = makeContextForTest();

    const verdict = await resolveWarehouseEntry(
      { store },
      OWN_ARCHIVED_WAREHOUSE_ID,
    );

    expect(verdict).toEqual({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: OWN_ARCHIVED_WAREHOUSE_ID,
    });
  });

  it.each([
    ['a live membership', OWN_MEMBER_WAREHOUSE_ID, true],
    ['an archived membership', OWN_ARCHIVED_WAREHOUSE_ID, true],
    ['no membership', OWN_NO_MEMBERSHIP_WAREHOUSE_ID, false],
  ])('admits reads for %s: %s', async (_label, warehouseId, expected) => {
    const { store } = makeContextForTest();

    const verdict = await resolveWarehouseEntry({ store }, warehouseId);

    expect(admitsReads(verdict)).toBe(expected);
  });

  it('enters for a live membership', async () => {
    const { store } = makeContextForTest();

    const verdict = await resolveWarehouseEntry(
      { store },
      OWN_MEMBER_WAREHOUSE_ID,
    );

    expect(verdict).toEqual({
      status: 'entered',
      warehouseId: OWN_MEMBER_WAREHOUSE_ID,
    });
  });

  it('never throws a redirect descriptor, on any path', async () => {
    const { store } = makeContextForTest();

    await expect(
      resolveWarehouseEntry({ store }, MALFORMED_WAREHOUSE_ID),
    ).resolves.not.toBeUndefined();
    await expect(
      resolveWarehouseEntry({ store }, OWN_ARCHIVED_WAREHOUSE_ID),
    ).resolves.not.toBeUndefined();
    await expect(
      resolveWarehouseEntry({ store }, OWN_MEMBER_WAREHOUSE_ID),
    ).resolves.not.toBeUndefined();
  });
});
