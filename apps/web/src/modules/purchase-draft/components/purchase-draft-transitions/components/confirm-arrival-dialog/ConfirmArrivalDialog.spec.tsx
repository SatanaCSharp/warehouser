import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmArrivalDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/confirm-arrival-dialog/ConfirmArrivalDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type {
  ArrivalConfirmation,
  PurchaseDraftDetail,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { Mock } from 'vitest';

// T21 — the 720px arrival modal (design-handoff.md `s5EPi`, AC-17/AC-17b/AC-18).
// DoD:
// - "the arrival modal's running assignment total is announced as a live region";
// - "a refused assignment surfaces the server's reason and states that nothing
//   changed — the client does not pre-judge the AC-18 bounds (AC-18)";
// - "a line assigning nothing is submittable and the copy explains that
//   confirming closes the draft once and for all (AC-17b)".

const ids = {
  draft: '00000000-0000-4000-8000-000000000501',
  lineOne: '00000000-0000-4000-8000-000000000601',
  lineTwo: '00000000-0000-4000-8000-000000000602',
  linkOne: '00000000-0000-4000-8000-000000000801',
  linkTwo: '00000000-0000-4000-8000-000000000802',
};

const line = (overrides: Partial<PurchaseDraftLine>): PurchaseDraftLine => ({
  id: ids.lineOne,
  itemId: '00000000-0000-4000-8000-000000000701',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  orderedQuantity: 1000,
  packagingTypeId: 'cartons',
  valueAddingNote: null,
  receivedQuantity: null,
  links: [],
  ...overrides,
});

const linkedLine = line({
  links: [
    {
      id: ids.linkOne,
      customerOrderId: '00000000-0000-4000-8000-000000000901',
      customerName: 'Nordwind Logistik GmbH',
      statedQuantity: 600,
      snapshot: null,
      current: {
        quantity: 600,
        neededBy: '2026-09-10',
        state: 'unfulfilled',
        outstandingQuantity: 600,
      },
      driftSignals: [],
      allocation: null,
    },
    {
      id: ids.linkTwo,
      customerOrderId: '00000000-0000-4000-8000-000000000902',
      customerName: 'Baltic Freight OU',
      statedQuantity: 400,
      snapshot: null,
      current: {
        quantity: 400,
        neededBy: '2026-09-12',
        state: 'unfulfilled',
        outstandingQuantity: 400,
      },
      driftSignals: [],
      allocation: null,
    },
  ],
});

// AC-17b's second line: it links only to Customer Orders since cancelled or
// fulfilled, so nothing is assigned from it.
const unassignableLine = line({
  id: ids.lineTwo,
  itemSku: 'WH-100733',
  itemDescription: 'Carton 600x400x300',
  orderedQuantity: 400,
  links: [],
});

const draft: PurchaseDraftDetail = {
  id: ids.draft,
  state: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-01',
  lineCount: 2,
  hasDriftSignal: false,
  closureReason: null,
  createdByUserId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: '00000000-0000-4000-8000-000000000001',
  readiedAt: '2026-08-05T09:00:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [linkedLine, unassignableLine],
};

const openDialog = (
  onSubmit: (input: ArrivalConfirmation) => Promise<MutationResult>,
  onClose = vi.fn(),
): void => {
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <ConfirmArrivalDialog draft={draft} onSubmit={onSubmit} />
    </DialogHost>,
  );
};

const arrivalDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: /confirm arrival/iu });

const submitButton = (dialog: HTMLElement): HTMLElement =>
  within(dialog).getByRole('button', { name: /confirm arrival/iu });

type SubmitArrival = (input: ArrivalConfirmation) => Promise<MutationResult>;

const succeeds = (): Mock<SubmitArrival> =>
  vi.fn<SubmitArrival>().mockResolvedValue({ data: {} });

describe('ConfirmArrivalDialog', () => {
  it('records what arrived on each line and every assignment, then closes (AC-17)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = succeeds();
    openDialog(onSubmit, onClose);

    const dialog = arrivalDialog();
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '1180',
    );
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100733/iu));
    await user.type(within(dialog).getByLabelText(/arrived.*WH-100733/iu), '0');
    await user.type(
      within(dialog).getByLabelText(/for Nordwind Logistik GmbH/iu),
      '600',
    );
    await user.type(
      within(dialog).getByLabelText(/for Baltic Freight OU/iu),
      '400',
    );
    await user.click(submitButton(dialog));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        lines: [
          {
            purchaseDraftLineId: ids.lineOne,
            receivedQuantity: 1180,
            allocations: [
              {
                purchaseDraftLineLinkId: ids.linkOne,
                allocatedQuantity: 600,
              },
              {
                purchaseDraftLineLinkId: ids.linkTwo,
                allocatedQuantity: 400,
              },
            ],
          },
          {
            purchaseDraftLineId: ids.lineTwo,
            receivedQuantity: 0,
            allocations: [],
          },
        ],
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('announces the running assignment total of a line through a live region', async () => {
    const user = userEvent.setup();
    openDialog(succeeds());

    const dialog = arrivalDialog();
    const summary = within(dialog).getByRole('status', {
      name: /WH-100420/iu,
    });
    expect(summary).toHaveAttribute('aria-live', 'polite');

    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '1180',
    );
    await user.type(
      within(dialog).getByLabelText(/for Nordwind Logistik GmbH/iu),
      '600',
    );

    await waitFor(() =>
      expect(summary).toHaveTextContent(
        /1180 arrived.*600 assigned.*580 left unassigned/iu,
      ),
    );
  });

  it('submits a line that assigns nothing, and says that confirming closes the draft once and for all (AC-17b)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit);

    const dialog = arrivalDialog();
    expect(
      within(dialog).getByText(/closes a draft once and for all/iu),
    ).toBeVisible();

    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '900',
    );
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100733/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100733/iu),
      '250',
    );
    await user.click(submitButton(dialog));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        lines: [
          {
            purchaseDraftLineId: ids.lineOne,
            receivedQuantity: 900,
            allocations: [],
          },
          {
            purchaseDraftLineId: ids.lineTwo,
            receivedQuantity: 250,
            allocations: [],
          },
        ],
      }),
    );
  });

  it('never pre-judges the AC-18 bounds: an over-assignment is still sent, and the server reason is what the member is told (AC-18)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(input: ArrivalConfirmation) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
          fieldErrors: {},
        },
      });
    openDialog(onSubmit);

    const dialog = arrivalDialog();
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '100',
    );
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100733/iu));
    await user.type(within(dialog).getByLabelText(/arrived.*WH-100733/iu), '0');
    // Far more than arrived, and more than either order is waiting for: the
    // client sends it anyway, because the bounds are the server's to re-check
    // at the moment the confirmation is recorded.
    await user.type(
      within(dialog).getByLabelText(/for Nordwind Logistik GmbH/iu),
      '5000',
    );
    await user.click(submitButton(dialog));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].lines[0]?.allocations).toEqual([
      { purchaseDraftLineLinkId: ids.linkOne, allocatedQuantity: 5000 },
    ]);

    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(/more than/iu);
    expect(refusal).toHaveTextContent(
      /nothing of this confirmation has been saved/iu,
    );
    expect(dialog).toBeInTheDocument();
  });

  it('places cancel before the primary in DOM and keyboard order, in a 720px modal', () => {
    openDialog(succeeds());

    const dialog = arrivalDialog();
    const labels = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) => /confirm arrival/iu.test(label ?? '')),
    );
  });
});
