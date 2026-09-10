import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

// The extraction this suite exists for: `read-purchase-draft.query.ts` and
// `list-purchase-draft-lines.query.ts` each carried a byte-identical private
// `rejectionReasonLabelsOf`, and each injected the catalogue repository to run it
// (code-review-back-end-2026-09-09.md, blocking finding 3).
const queryDirectory = join(__dirname, '../../usecases/queries');

const catalogueDouble = (
  reasons: readonly { id: string; label: string }[] = [
    { id: 'damaged_in_transit', label: 'Damaged in transit' },
  ],
): { resolveRejectionReasons: Mock } => ({
  resolveRejectionReasons: vi.fn().mockResolvedValue([...reasons]),
});

const endingNaming = (
  ...rejectionReasonIds: string[]
): { rejections: { rejectionReasonId: string }[] } => ({
  rejections: rejectionReasonIds.map((rejectionReasonId) => ({
    rejectionReasonId,
  })),
});

describe('RejectionReasonLabelService', () => {
  // AC-23a — one read per read, however many lines or refusals name a Reason. This is the property
  // that makes it a service rather than a helper: it reaches a repository, so the repository is
  // injected once instead of threaded through both callers (server-architecture.md §Services).
  it('resolves the whole read’s Reasons in one catalogue read', async () => {
    const catalogue = catalogueDouble();

    const labels = await new RejectionReasonLabelService(
      catalogue as never,
    ).labelsFor([
      endingNaming('damaged_in_transit', 'unfit_other'),
      endingNaming('damaged_in_transit'),
    ] as never);

    expect(catalogue.resolveRejectionReasons).toHaveBeenCalledTimes(1);
    expect(catalogue.resolveRejectionReasons).toHaveBeenCalledWith([
      'damaged_in_transit',
      'unfit_other',
    ]);
    expect(labels.get('damaged_in_transit')).toBe('Damaged in transit');
  });

  // A withheld read carries no `rejections` property at all, and a draft whose lines ended without a
  // refusal names no Reason — neither may cost a query.
  it.each([
    ['a read naming no Reason', [endingNaming()]],
    ['a draft whose lines carry no ending', [null]],
    ['an empty read', []],
  ])('asks the catalogue nothing for %s', async (_case, endings) => {
    const catalogue = catalogueDouble();

    const labels = await new RejectionReasonLabelService(
      catalogue as never,
    ).labelsFor(endings as never);

    expect(catalogue.resolveRejectionReasons).not.toHaveBeenCalled();
    expect(labels.size).toBe(0);
  });

  // The refusal that made this an extraction: a second copy in either query is the duplication the
  // service exists to remove, and it would drift silently because both copies pass their own tests.
  it.each([
    'read-purchase-draft.query.ts',
    'list-purchase-draft-lines.query.ts',
  ])(
    '%s reaches the catalogue through this service, never for itself',
    (fileName) => {
      const source = readFileSync(join(queryDirectory, fileName), 'utf8');

      expect(source).not.toMatch(/resolveRejectionReasons/u);
      expect(source).not.toMatch(/RejectionReasonCatalogueRepository/u);
      expect(source).toMatch(/this\.rejectionReasonLabels\.labelsFor\(/u);
    },
  );
});
