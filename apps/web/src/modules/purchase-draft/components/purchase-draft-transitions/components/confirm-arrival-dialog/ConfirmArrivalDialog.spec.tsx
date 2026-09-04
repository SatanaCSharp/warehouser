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
  cancelledLink: '00000000-0000-4000-8000-000000000803',
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
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: 'Test Warehouse North, Test Industrial Estate',
    accessNotes: null,
    frozen: false,
  },
  customerDestination: null,
  links: [],
  ...overrides,
});

const linkedLine = line({
  links: [
    {
      id: ids.linkOne,
      customerOrderId: '00000000-0000-4000-8000-000000000901',
      customer: null,
      customerName: 'Nordwind Logistik GmbH',
      statedQuantity: 600,
      snapshot: null,
      current: {
        quantity: 600,
        neededBy: '2026-09-10',
        state: 'unfulfilled',
        outstandingQuantity: 600,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
    {
      id: ids.linkTwo,
      customerOrderId: '00000000-0000-4000-8000-000000000902',
      customer: null,
      customerName: 'Baltic Freight OU',
      statedQuantity: 400,
      snapshot: null,
      current: {
        quantity: 400,
        neededBy: '2026-09-12',
        state: 'unfulfilled',
        outstandingQuantity: 400,
        lastChangedAt: null,
        deliveryAddress: null,
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
  reference: 'PD-0142',
  state: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-01',
  lineCount: 2,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
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

// The frozen draft the approved frame `s5EPi` actually draws: line 1 ordered
// 1 200, one customer still waiting for 1 000, and one whose order was cancelled
// after the freeze, which is where the disabled row, the grouped figures and the
// AC-18 refusal all land at once.
const frozenDraft: PurchaseDraftDetail = {
  ...draft,
  lineCount: 1,
  lines: [
    line({
      orderedQuantity: 1200,
      links: [
        {
          id: ids.linkOne,
          customerOrderId: '00000000-0000-4000-8000-000000000901',
          customer: null,
          customerName: 'Nordwind Logistik GmbH',
          statedQuantity: 800,
          snapshot: {
            capturedDeliveryAddressId: null,
            capturedDeliveryAddressText: null,
            capturedQuantity: 800,
            capturedNeededBy: '2026-09-02',
            capturedState: 'unfulfilled',
          },
          current: {
            quantity: 1000,
            neededBy: '2026-09-02',
            state: 'unfulfilled',
            outstandingQuantity: 1000,
            lastChangedAt: '2026-08-25T12:00:00.000Z',
            deliveryAddress: null,
          },
          driftSignals: ['quantity_changed'],
          allocation: null,
        },
        {
          id: ids.cancelledLink,
          customerOrderId: '00000000-0000-4000-8000-000000000903',
          customer: null,
          customerName: 'Baltic Freight OU',
          statedQuantity: 400,
          snapshot: {
            capturedDeliveryAddressId: null,
            capturedDeliveryAddressText: null,
            capturedQuantity: 400,
            capturedNeededBy: '2026-09-12',
            capturedState: 'unfulfilled',
          },
          current: {
            quantity: 400,
            neededBy: '2026-09-12',
            state: 'cancelled',
            outstandingQuantity: 0,
            lastChangedAt: '2026-08-24T12:00:00.000Z',
            deliveryAddress: null,
          },
          driftSignals: ['cancelled'],
          allocation: null,
        },
      ],
    }),
  ],
};

const openDialog = (
  onSubmit: (input: ArrivalConfirmation) => Promise<MutationResult>,
  onClose = vi.fn(),
  detail = draft,
): void => {
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <ConfirmArrivalDialog draft={detail} onSubmit={onSubmit} />
    </DialogHost>,
  );
};

const arrivalDialog = (): HTMLElement =>
  // The title names the draft the arrival is being confirmed on (`s5EPi`).
  screen.getByRole('dialog', { name: /confirm what arrived on pd-0142/iu });

const submitButton = (dialog: HTMLElement): HTMLElement =>
  within(dialog).getByRole('button', {
    name: /confirm arrival and close the draft/iu,
  });

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
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '600',
    );
    await user.type(
      within(dialog).getByLabelText(/assign to Baltic Freight OU/iu),
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
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '600',
    );

    await waitFor(() =>
      expect(summary).toHaveTextContent(
        /1\s180 arrived.*600 assigned.*580 left unassigned/iu,
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
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
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

  it('states that the confirmation is recorded whole and that on-hand quantities are not touched (AC-18a)', () => {
    openDialog(succeeds());

    expect(
      within(arrivalDialog()).getByText(
        /recorded together — or none of them is.*on-hand quantities are not touched/isu,
      ),
    ).toBeVisible();
  });

  it('places cancel before the primary in DOM and keyboard order, in a 720px modal', () => {
    openDialog(succeeds());

    const dialog = arrivalDialog();
    const labels = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) =>
        /confirm arrival and close the draft/iu.test(label ?? ''),
      ),
    );
  });
});

// The frozen draft the frame draws — line 1 ordered 1 200, one customer still
// waiting for 1 000 and one whose order was cancelled after the freeze — which
// is where the disabled row, the grouped figures and the AC-18 breakdown all
// land at once.
describe('ConfirmArrivalDialog, on a frozen draft whose demand moved', () => {
  it('offers no assignment to a customer order cancelled since the freeze, and says what was riding on it (AC-18)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit, vi.fn(), frozenDraft);

    const dialog = arrivalDialog();
    expect(
      within(dialog).getByLabelText(/assign to Baltic Freight OU/iu),
    ).toBeDisabled();

    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '1180',
    );
    await user.type(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '1000',
    );
    await user.click(submitButton(dialog));

    // Nothing is sent for the cancelled link, so the confirmation cannot be
    // refused for an assignment the member was never offered.
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        lines: [
          {
            purchaseDraftLineId: ids.lineOne,
            receivedQuantity: 1180,
            allocations: [
              { purchaseDraftLineLinkId: ids.linkOne, allocatedQuantity: 1000 },
            ],
          },
        ],
      }),
    );
  });

  it('groups every quantity it renders, and names the customer an assignment fulfils (AC-17a)', async () => {
    const user = userEvent.setup();
    openDialog(succeeds(), vi.fn(), frozenDraft);

    const dialog = arrivalDialog();
    expect(within(dialog).getByText(/1\s200 ordered/u)).toBeVisible();
    expect(within(dialog).getByText(/1\s000 still outstanding/u)).toBeVisible();

    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '1180',
    );
    await user.type(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '1000',
    );

    const summary = within(dialog).getByRole('status', { name: /WH-100420/iu });
    await waitFor(() =>
      expect(summary).toHaveTextContent(
        /1\s180 arrived · 1\s000 assigned · 180 left unassigned/u,
      ),
    );
    expect(summary).toHaveTextContent(
      /Nordwind Logistik GmbH becomes fulfilled and leaves the consolidated demand/iu,
    );
  });

  it('carries the refusal envelope through to the bound it names, and back to the form leaves the values in place (AC-18)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(input: ArrivalConfirmation) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
          details: {
            violations: [
              {
                purchaseDraftLineLinkId: ids.linkOne,
                rule: 'exceeds_outstanding_quantity',
                outstandingQuantity: 1000,
                allocatedQuantity: 1100,
              },
            ],
          },
        },
      });
    openDialog(onSubmit, vi.fn(), frozenDraft);

    const dialog = arrivalDialog();
    await user.type(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '1100',
    );
    await user.click(submitButton(dialog));

    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(/that assignment cannot be recorded/iu);
    expect(refusal).toHaveTextContent(
      /Nordwind Logistik GmbH — you assigned 1\s100, but they are waiting for 1\s000/u,
    );

    await user.click(
      within(refusal).getByRole('button', { name: /back to the form/iu }),
    );

    await waitFor(() =>
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument(),
    );
    // A refused confirmation changed nothing, so nothing has to be re-entered.
    expect(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
    ).toHaveValue(1100);
  });
});
