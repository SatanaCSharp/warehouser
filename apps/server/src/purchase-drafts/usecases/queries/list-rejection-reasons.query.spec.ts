// T12 — `ListRejectionReasonsQuery`, the `ListPackagingTypesQuery` shape with one method more
// (data-model.md § "Repository boundaries", sad.md §6.5). AC-06/AC-07: the catalogue is
// workspace-wide reference data — served whole, unpaged, taking no Warehouse scope — and each row
// reports `requiresDescription` so the client knows before submission which Reasons demand prose.
//
// `purchase-drafts/usecases/queries/list-rejection-reasons.query.ts` does not exist yet, so this
// import fails to resolve (GOOD red).
import { ListRejectionReasonsQuery } from 'purchase-drafts/usecases/queries/list-rejection-reasons.query';

const aReasonRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'damaged_in_transit',
  label: 'Damaged in transit',
  requiresDescription: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const repositoryDouble = (rows: readonly unknown[]) => ({
  listRejectionReasons: jest.fn().mockResolvedValue(rows),
});

describe('ListRejectionReasonsQuery', () => {
  // AC-06 — the catalogue whole, in one read, with no Warehouse scope taken as an argument: the
  // repository double's signature has none, and `execute` accepts none either.
  it('returns the whole catalogue with no Warehouse scope and no paging', async () => {
    const rows = [
      aReasonRow({ id: 'damaged_in_transit', label: 'Damaged in transit' }),
      aReasonRow({
        id: 'unfit_other',
        label: 'Unfit — other',
        requiresDescription: true,
      }),
    ];
    const repository = repositoryDouble(rows);
    const query = new ListRejectionReasonsQuery(repository as never);

    const result = await query.execute();

    expect(repository.listRejectionReasons).toHaveBeenCalledWith();
    expect(result).toHaveLength(2);
  });

  // AC-06/AC-07 — each catalogue entry reports whether it requires a description, read as catalogue
  // data rather than assumed from a hard-coded identifier.
  it('reports requiresDescription per Reason, drawn from the catalogue row rather than assumed', async () => {
    const repository = repositoryDouble([
      aReasonRow({
        id: 'unfit_other',
        label: 'Unfit — other',
        requiresDescription: true,
      }),
      aReasonRow({
        id: 'quality_defect',
        label: 'Quality defect',
        requiresDescription: false,
      }),
    ]);
    const query = new ListRejectionReasonsQuery(repository as never);

    const result = await query.execute();

    expect(result.find((reason) => reason.id === 'unfit_other')).toEqual(
      expect.objectContaining({ requiresDescription: true }),
    );
    expect(result.find((reason) => reason.id === 'quality_defect')).toEqual(
      expect.objectContaining({ requiresDescription: false }),
    );
  });

  it('returns nothing rather than throwing when the catalogue is empty', async () => {
    const repository = repositoryDouble([]);
    const query = new ListRejectionReasonsQuery(repository as never);

    await expect(query.execute()).resolves.toEqual([]);
  });
});
