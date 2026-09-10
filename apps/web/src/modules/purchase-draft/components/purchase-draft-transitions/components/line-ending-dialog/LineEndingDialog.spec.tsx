import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  PurchaseDraftDetail,
  PurchaseDraftLine,
  PurchaseDraftLineArrival,
  PurchaseDraftLineDirectDelivery,
} from '@warehouser/contracts/purchase-drafts';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { LineEndingDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/LineEndingDialog';
import {
  parseLineArrivalForm,
  parseLineDirectDeliveryForm,
} from 'modules/purchase-draft/utils/line-ending-form';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

/**
 * T15 — `ConditionBlock` gates its `Refuse some of this` control on
 * `REJECTIONS:CREATE` and reads its Rejection Reason catalogue through the
 * shared Warehouse-authority projection, so this dialog now genuinely needs
 * one: `renderWithProviders` no longer suffices for a fixture that always
 * carries something received (`AC-04a` is the only case it would). Every
 * fixture below holds every Permission, since none of these cases is about
 * gating — that is `ConditionBlock.spec.tsx`'s own subject.
 */
const seedWarehouseAuthority = (
  store: AppStore,
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): void => {
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
        archivedAt: null,
      },
    ),
  );
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listRejectionReasons',
      accessIds.warehouse,
      [
        {
          id: 'damaged_by_packing',
          label: 'Damaged by packing',
          requiresDescription: false,
        },
      ],
    ),
  );
};

// T17/T24 — the 720px **per-line** ending modal (design-handoff.md `s5EPi`,
// ADR 0002, AC-19/AC-20a/AC-18). Rewritten from the whole-draft arrival modal
// this replaced: the dialog now records one line, and the copy no longer
// promises that recording it closes the draft — that happens only on the draft's
// last line (AC-19).
// DoD:
// - "the ending modal's running assignment total is announced as a live region";
// - "a refused assignment surfaces the server's reason and states that nothing
//   changed — the client does not pre-judge the AC-18 bounds (AC-18)";
// - "a line assigning nothing is submittable, and the copy states that the line
//   ends once (AC-20a)".

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
  ending: null,
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
  onSubmit: (input: PurchaseDraftLineArrival) => Promise<MutationResult>,
  onClose = vi.fn(),
  detail = draft,
  subject: PurchaseDraftLine = detail.lines[0],
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): void => {
  const store = authenticatedStore();
  seedWarehouseAuthority(store, permissionIds);
  renderInEnteredWarehouse(
    <DialogHost onClose={onClose}>
      <LineEndingDialog
        draft={detail}
        kind="arrival"
        line={subject}
        parse={parseLineArrivalForm(subject)}
        onSubmit={onSubmit}
      />
    </DialogHost>,
    store,
  );
};

const arrivalDialog = (): Promise<HTMLElement> =>
  // The title names the line and the draft the arrival is being recorded on
  // (`s5EPi`) — the line, because the act is now per line (ADR 0002).
  screen.findByRole('dialog', {
    name: /record what arrived at the dock — wh-100420 on pd-0142/iu,
  });

const submitButton = (dialog: HTMLElement): HTMLElement =>
  within(dialog).getByRole('button', { name: /record the arrival/iu });

type SubmitArrival = (
  input: PurchaseDraftLineArrival,
) => Promise<MutationResult>;

const succeeds = (): Mock<SubmitArrival> =>
  vi.fn<SubmitArrival>().mockResolvedValue({ data: {} });

/**
 * T16 — every fixture line in this file is frozen carrying a Packaging Type
 * (`line()`'s own default), so the supplier's-instruction judgement now gates
 * every submission the same way the assignment fields already did. "Met" is
 * the fastest legal answer and carries no note, so a case testing something
 * else entirely is not also made to type prose it does not care about.
 */
const answerConformanceHonoured = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
): Promise<void> => {
  await user.click(within(dialog).getByRole('radio', { name: /^met$/iu }));
};

const acknowledgeFinality = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
): Promise<void> => {
  await user.click(
    within(dialog).getByRole('checkbox', {
      name: /the customer has told me what arrived/iu,
    }),
  );
};

describe('LineEndingDialog', () => {
  // T17/ADR 0002 — the payload is one line's, and it carries **no line identifier at all**: the
  // line is the route. That is the shape difference the whole-draft form could not express.
  it('records what arrived on this line and every assignment, then closes (AC-19)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = succeeds();
    openDialog(onSubmit, onClose);

    const dialog = await arrivalDialog();
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '1180',
    );
    await user.type(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '600',
    );
    await user.type(
      within(dialog).getByLabelText(/assign to Baltic Freight OU/iu),
      '400',
    );
    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        receivedQuantity: 1180,
        allocations: [
          { purchaseDraftLineLinkId: ids.linkOne, allocatedQuantity: 600 },
          { purchaseDraftLineLinkId: ids.linkTwo, allocatedQuantity: 400 },
        ],
        preReceiptConformance: { verdict: 'met' },
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('announces the running assignment total of a line through a live region', async () => {
    const user = userEvent.setup();
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    const summary = within(dialog).getByRole('status', {
      name: /assignment total.*WH-100420/iu,
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

  // AC-19/AC-20a — the copy no longer promises that recording this closes the draft, because it
  // closes only on the draft's **last** line. What replaces it is the fact a member cannot see:
  // this line ends once.
  it('submits a line that assigns nothing, and says the line ends once (AC-20a)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit);

    const dialog = await arrivalDialog();
    expect(within(dialog).getByText(/this line ends once/iu)).toBeVisible();
    expect(
      within(dialog).queryByText(/closes a draft once and for all/iu),
    ).not.toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '900',
    );
    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        receivedQuantity: 900,
        allocations: [],
        preReceiptConformance: { verdict: 'met' },
      }),
    );
  });

  it('never pre-judges the AC-18 bounds: an over-assignment is still sent, and the server reason is what the member is told (AC-18)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(input: PurchaseDraftLineArrival) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
          fieldErrors: {},
        },
      });
    openDialog(onSubmit);

    const dialog = await arrivalDialog();
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '100',
    );
    // Far more than arrived, and more than either order is waiting for: the
    // client sends it anyway, because the bounds are the server's to re-check
    // at the moment the confirmation is recorded.
    await user.type(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '5000',
    );
    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].allocations).toEqual([
      { purchaseDraftLineLinkId: ids.linkOne, allocatedQuantity: 5000 },
    ]);

    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(/more than/iu);
    expect(refusal).toHaveTextContent(
      /nothing of this confirmation has been saved/iu,
    );
    expect(dialog).toBeInTheDocument();
  });

  it('states that the confirmation is recorded whole and that on-hand quantities are not touched (AC-18a)', async () => {
    openDialog(succeeds());

    expect(
      within(await arrivalDialog()).getByText(
        /recorded together — or none of them is.*on-hand quantities are not touched/isu,
      ),
    ).toBeVisible();
  });

  // `s5EPi` draws both of the modal's consequences as titled information
  // panels, not as bare paragraphs: a member skimming a 720px form reads
  // headings before prose, and the heading is what tells them the paragraph is
  // about something other than the field beside it.
  it('carries both consequences as titled panels rather than loose paragraphs', async () => {
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    expect(within(dialog).getByText('This ends this line only')).toBeVisible();
    expect(
      within(dialog).getByText('On-hand quantity does not move'),
    ).toBeVisible();
  });

  it('places cancel before the primary in DOM and keyboard order, in a 720px modal', async () => {
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    const labels = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) => /record the arrival/iu.test(label ?? '')),
    );
  });

  // T15/design-handoff.md §Accessibility — "dialog heading → presented
  // quantity → refuse control → each refusal (quantity → reason →
  // description → remove)". `DOCUMENT_POSITION_FOLLOWING` is asserted rather
  // than re-typed keystrokes, because tab order in jsdom follows DOM order for
  // every one of these elements — none carries a `tabIndex` of its own.
  it('keeps the condition block ahead of the assignments in keyboard order: presented → refuse → quantity → reason → description → remove', async () => {
    const user = userEvent.setup();
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    const presentedQuantity =
      within(dialog).getByLabelText(/arrived.*WH-100420/iu);
    const refuse = within(dialog).getByRole('button', {
      name: /refuse some of this/iu,
    });
    await user.click(refuse);

    const refusedQuantity = within(dialog).getByRole('spinbutton', {
      name: /quantity refused/iu,
    });
    const reason = within(dialog).getByRole('button', { name: /reason/iu });
    const description = within(dialog).getByRole('textbox', {
      name: /describe what was wrong/iu,
    });
    const remove = within(dialog).getByRole('button', {
      name: /remove the refusal/iu,
    });
    const firstAssignment = within(dialog).getByLabelText(
      /assign to Nordwind Logistik GmbH/iu,
    );

    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    // The approved frame (`app.pen` `W6TARi`/`H0jcSr`, `Inspection/Rejection
    // Row` `H6tv5L`) draws quantity + Reason + remove on one row and
    // description on the next, so that is the DOM/tab order this asserts —
    // quantity → reason → remove → description — even though
    // design-handoff.md §Accessibility's prose states "quantity → reason →
    // description → remove" for the same row. The handoff's own front matter
    // settles this: the frame and its node ids are the contract, and a
    // preview HTML is review evidence only, never an implementation source.
    // (2026-09-08 review: documentation amendment tracked separately so
    // T16/T18 do not re-litigate it.)
    const ordered = [
      presentedQuantity,
      refuse,
      refusedQuantity,
      reason,
      remove,
      description,
      firstAssignment,
    ];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const earlier = ordered[index] as Node;
      const later = ordered[index + 1] as Node;
      expect(earlier.compareDocumentPosition(later)).toBe(FOLLOWING);
    }
  });
});

describe('LineEndingDialog condition block wiring (2026-09-08 review)', () => {
  // 2026-09-08 review — BLOCKER. A rename mutation of `LineEndingForm.rejections`
  // to `refusals` on the *parse side only*, leaving `ConditionBlock.tsx`
  // untouched, left `tsc`, `eslint` and all 178 files/1447 tests green while
  // every refusal a member types was silently dropped from a write-once
  // ending (AC-04). No prior case ever submitted a refusal through to the
  // payload — this one does, and pins the exact shape.
  it('carries a refusal through to the submitted payload, sourced from the dock (T15 review blocker)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit);

    const dialog = await arrivalDialog();
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/arrived.*WH-100420/iu),
      '100',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /refuse some of this/iu }),
    );
    await user.type(
      within(dialog).getByRole('spinbutton', { name: /quantity refused/iu }),
      '5',
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /reason/iu }),
      'Damaged by packing',
    );
    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        receivedQuantity: 100,
        allocations: [],
        rejections: [
          {
            rejectionReasonId: 'damaged_by_packing',
            quantity: 5,
            source: 'inspected',
          },
        ],
        preReceiptConformance: { verdict: 'met' },
      }),
    );
  });

  // AC-01b — an ending that refuses nothing still records, and carries no
  // `rejections` property at all: the Condition Split is contract-optional
  // and this ending never opened one.
  it('records an ending that refuses nothing when the member holds no REJECTIONS:CREATE, with no `rejections` property (AC-01b)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(
      onSubmit,
      vi.fn(),
      draft,
      draft.lines[0],
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.REJECTIONS_CREATE,
      ),
    );

    const dialog = await arrivalDialog();
    expect(
      within(dialog).queryByRole('button', { name: /refuse some of this/iu }),
    ).not.toBeInTheDocument();

    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('rejections');
  });

  // 2026-09-08 review — mutation-proven open: replacing `remove(index)` with a
  // no-op left every prior case green, because none of them removed a row
  // that had a surviving sibling. `useFieldArray` + bare `register` re-indexes
  // the rows that remain, so this proves the *survivor*, not just the count.
  it('keeps a surviving row’s own values after removing an earlier one, and re-derives the summary', async () => {
    const user = userEvent.setup();
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    await user.click(
      within(dialog).getByRole('button', { name: /refuse some of this/iu }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /refuse some of this/iu }),
    );

    const quantities = within(dialog).getAllByRole('spinbutton', {
      name: /quantity refused/iu,
    });
    await user.type(quantities[0], '5');
    await user.type(quantities[1], '3');

    await user.click(
      within(dialog).getAllByRole('button', {
        name: /remove the refusal/iu,
      })[0],
    );

    const survivor = within(dialog).getByRole('spinbutton', {
      name: /quantity refused/iu,
    });
    expect(survivor).toHaveValue(3);

    const summary = within(dialog).getByRole('status', {
      name: /condition summary/iu,
    });
    await waitFor(() => expect(summary).toHaveTextContent(/3.*refused/isu));
  });

  // design-handoff.md § States (`vZpFV`), test-plan.md:62, AC-04a — the
  // condition block, its refuse control and its summary are all absent on a
  // line where nothing was received. Mutation-proven open: `when={true}`
  // leaves every other case green.
  it('renders no condition block at all when nothing was received (AC-04a)', async () => {
    const user = userEvent.setup();
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    await user.clear(within(dialog).getByLabelText(/arrived.*WH-100420/iu));
    await user.type(within(dialog).getByLabelText(/arrived.*WH-100420/iu), '0');

    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', {
          name: /refuse some of this/iu,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(dialog).queryByRole('status', { name: /condition summary/iu }),
    ).not.toBeInTheDocument();
    // T16/AC-04a — the conformance block is the condition block's sibling in
    // `LineEndingFieldset`'s own `Conditional`, so it is absent for the same
    // reason and on the same line: nothing was received, so there is nothing
    // to judge. Paired with
    // 'blocks the primary action until the supplier's-instruction judgement...'
    // below, which proves the radiogroup exists on this very line once
    // something is received — so this is not an absence that would hold
    // whether or not the feature exists at all.
    expect(
      within(dialog).queryByRole('radiogroup', {
        name: /did the supplier follow your instruction/iu,
      }),
    ).not.toBeInTheDocument();
  });
});

describe('LineEndingDialog conformance block (T16)', () => {
  // AC-15/AC-17a — the fastest path through the dock still requires looking
  // at the goods: nothing is pre-selected, and the primary action stays
  // unavailable until the judgement is given, on a line frozen carrying an
  // instruction (`line()`'s default `packagingTypeId: 'cartons'`).
  it("blocks the primary action until the supplier's-instruction judgement is answered on an instructed line (AC-15, AC-17a)", async () => {
    const user = userEvent.setup();
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    const radiogroup = within(dialog).getByRole('radiogroup', {
      name: /did the supplier follow your instruction/iu,
    });
    for (const option of within(radiogroup).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    expect(submitButton(dialog)).toBeDisabled();

    await user.click(
      within(radiogroup).getByRole('radio', { name: /^met$/iu }),
    );

    await waitFor(() => expect(submitButton(dialog)).toBeEnabled());
  });

  // AC-17a — "not applicable" is not a legal answer for a line frozen
  // carrying an instruction; the option withholds itself rather than being
  // offered and refused server-side.
  it('withholds "not applicable" on a line frozen with an instruction (AC-17a)', async () => {
    openDialog(succeeds());

    const dialog = await arrivalDialog();
    expect(
      within(dialog).getByRole('radio', { name: /not applicable/iu }),
    ).toBeDisabled();
  });

  // AC-17 — the opposite line: no Packaging Type and no Value-adding Note, so
  // only "not applicable" is a legal answer.
  it('withholds "Met" and "Not met" on a line frozen with no instruction (AC-17)', async () => {
    openDialog(
      succeeds(),
      vi.fn(),
      draft,
      line({ id: ids.lineOne, packagingTypeId: null, valueAddingNote: null }),
    );

    const dialog = await arrivalDialog();
    expect(
      within(dialog).getByRole('radio', { name: /^met$/iu }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('radio', { name: /^not met$/iu }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('radio', { name: /not applicable/iu }),
    ).toBeEnabled();
  });

  // AC-15a — one judgement covers both a Packaging Type and a Value-adding
  // Note frozen on the same line: never a second radiogroup for the second
  // instruction.
  it('offers one judgement for a line frozen with both a Packaging Type and a Value-adding Note (AC-15a)', async () => {
    openDialog(
      succeeds(),
      vi.fn(),
      draft,
      line({ valueAddingNote: 'Add desiccant packs' }),
    );

    const dialog = await arrivalDialog();
    expect(within(dialog).getAllByRole('radiogroup')).toHaveLength(1);
  });

  // AC-15/AC-15a — the note is where the member names which of the two failed;
  // it exists only once "Not met" needs one explained.
  it('shows the conformance note only under "Not met" (AC-15)', async () => {
    const user = userEvent.setup();
    openDialog(succeeds());
    const dialog = await arrivalDialog();
    const radiogroup = within(dialog).getByRole('radiogroup', {
      name: /did the supplier follow your instruction/iu,
    });

    await user.click(
      within(radiogroup).getByRole('radio', { name: /^met$/iu }),
    );
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(
      within(radiogroup).getByRole('radio', { name: /^not met$/iu }),
    );
    const note = await within(dialog).findByRole('textbox');
    await user.type(note, 'value-adding note not applied');
    expect(note).toHaveValue('value-adding note not applied');
  });

  // T16 seam (2026-09-08 review pattern, `answerConformanceHonoured` above) —
  // no prior case in this file ever carries a verdict through submit into the
  // payload; this proves the field the radiogroup writes into is the field
  // the parse step reads, exactly the way the T15 review blocker proved it for
  // `rejections`.
  it('carries the verdict and its note through submit into the payload (AC-15, AC-15a)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit);
    const dialog = await arrivalDialog();

    await user.click(
      within(dialog).getByRole('radio', { name: /^not met$/iu }),
    );
    const note = await within(dialog).findByRole('textbox');
    await user.type(note, 'wrong labels used');
    await user.click(submitButton(dialog));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          preReceiptConformance: {
            verdict: 'not_met',
            note: 'wrong labels used',
          },
        }),
      ),
    );
  });

  // The two-arm contract shape (`preReceiptConformanceWithoutNoteCreateSchema`
  // vs `...NotMetCreateSchema`) admits no `note` property at all under "Met" —
  // not an empty string. A client that always sent `note: ''` would pass a
  // looser check than this one.
  it('sends a Met verdict with no `note` property at all', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit);
    const dialog = await arrivalDialog();

    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0]?.[0] as {
      preReceiptConformance?: { note?: string; verdict: string };
    };
    expect(payload.preReceiptConformance).toEqual({ verdict: 'met' });
  });
});

// The Direct to Customer half. Everything the arrival half proves about the form holds here
// identically — the two differ only in the route they reach and the name of the quantity
// (ADR 0002) — so this suite covers exactly what is genuinely different: the copy, the payload
// key, and that the same keyboard order holds in the second 720px modal.
describe('LineEndingDialog, recording a direct delivery', () => {
  const directLine = line({
    deliveryMode: 'direct_to_customer',
    warehouseDestination: null,
    links: linkedLine.links,
  });
  const directDraft: PurchaseDraftDetail = { ...draft, lines: [directLine] };

  const openDirect = (
    onSubmit: (
      input: PurchaseDraftLineDirectDelivery,
    ) => Promise<MutationResult>,
  ): void => {
    const store = authenticatedStore();
    seedWarehouseAuthority(store);
    renderInEnteredWarehouse(
      <DialogHost onClose={vi.fn()}>
        <LineEndingDialog
          draft={directDraft}
          kind="directDelivery"
          line={directLine}
          parse={parseLineDirectDeliveryForm(directLine)}
          onSubmit={onSubmit}
        />
      </DialogHost>,
      store,
    );
  };

  const directDialog = (): Promise<HTMLElement> =>
    screen.findByRole('dialog', {
      name: /record what the customer received — wh-100420 on pd-0142/iu,
    });

  type SubmitDirectDelivery = (
    input: PurchaseDraftLineDirectDelivery,
  ) => Promise<MutationResult>;

  const succeedsDirect = (): Mock<SubmitDirectDelivery> =>
    vi.fn<SubmitDirectDelivery>().mockResolvedValue({ data: {} });

  it('sends the quantity as deliveredQuantity, never as receivedQuantity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(input: PurchaseDraftLineDirectDelivery) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDirect(onSubmit);

    const dialog = await directDialog();
    await user.clear(within(dialog).getByLabelText(/received.*WH-100420/iu));
    await user.type(
      within(dialog).getByLabelText(/received.*WH-100420/iu),
      '60',
    );
    await answerConformanceHonoured(user, dialog);
    await acknowledgeFinality(user, dialog);
    await user.click(
      within(dialog).getByRole('button', { name: /record the delivery/iu }),
    );

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        deliveredQuantity: 60,
        allocations: [],
        preReceiptConformance: { verdict: 'met' },
      }),
    );
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('receivedQuantity');
  });

  // AC-21 — on this half the untouched stock is the *stronger* statement: the goods were never in
  // the building to be counted, which is not a fact the draft itself shows anywhere.
  it('states that no stock moved because the goods never entered the building (AC-21)', async () => {
    openDirect(vi.fn().mockResolvedValue({ data: {} }));

    expect(
      within(await directDialog()).getByText(
        /never in the transit zone to be counted/iu,
      ),
    ).toBeVisible();
  });

  it('places cancel before the primary in DOM and keyboard order', async () => {
    openDirect(vi.fn().mockResolvedValue({ data: {} }));

    const labels = within(await directDialog())
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) => /record the delivery/iu.test(label ?? '')),
    );
  });

  // T16, design-handoff.md `S9PcQ`, spec.md §8 ninth question — the member
  // alone judges when a directly delivered line's account is settled; the
  // acknowledgement is the one deliberate friction on that act.
  describe('finality acknowledgement (T16)', () => {
    it('disables the primary action until the acknowledgement is ticked, even once the judgement is answered', async () => {
      const user = userEvent.setup();
      openDirect(succeedsDirect());
      const dialog = await directDialog();

      const submit = within(dialog).getByRole('button', {
        name: /record the delivery/iu,
      });
      const checkbox = within(dialog).getByRole('checkbox', {
        name: /the customer has told me what arrived/iu,
      });
      expect(submit).toBeDisabled();
      expect(checkbox).not.toBeChecked();

      await answerConformanceHonoured(user, dialog);
      expect(submit).toBeDisabled();

      await user.click(checkbox);
      await waitFor(() => expect(submit).toBeEnabled());
    });

    it('is a labelled checkbox, never a styled div, with its consequence associated so it is heard before ticking', async () => {
      openDirect(succeedsDirect());
      const dialog = await directDialog();

      const checkbox = within(dialog).getByRole('checkbox', {
        name: /the customer has told me what arrived/iu,
      });
      expect(checkbox.tagName).toBe('INPUT');

      const describedBy = checkbox.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const description = describedBy
        ? document.getElementById(describedBy)
        : null;
      expect(description).not.toBeNull();
      expect(description).toHaveTextContent(/final/iu);
    });

    // sad.md §6.2's hard rule: an interaction, not a state. No column, no
    // timer, no scheduled transition, and none inferable from this step.
    // `advanceTimers` lets `userEvent` and `findBy*` cooperate with the faked
    // clock (`route-readiness.spec.tsx`'s own pattern) — the clock is what
    // actually gets exercised here, thirty days deep, not merely spied on.
    it('introduces no scheduled transition and no derived deadline: thirty days change nothing (sad.md §6.2)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        openDirect(succeedsDirect());
        const dialog = await directDialog();

        const checkbox = within(dialog).getByRole('checkbox', {
          name: /the customer has told me what arrived/iu,
        });
        await user.click(checkbox);
        expect(checkbox).toBeChecked();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 24 * 30);
        });

        // Still exactly what the member did, nothing a clock did to it.
        expect(checkbox).toBeChecked();
        expect(
          within(dialog).getByRole('button', { name: /record the delivery/iu }),
        ).toBeDisabled(); // the judgement is still unanswered — a clock alone never opens the primary action
        expect(
          within(dialog).queryByText(
            /expires|deadline|window|countdown|days? (?:remaining|left)/iu,
          ),
        ).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// The frozen draft the frame draws — line 1 ordered 1 200, one customer still
// waiting for 1 000 and one whose order was cancelled after the freeze — which
// is where the disabled row, the grouped figures and the AC-18 breakdown all
// land at once.
describe('LineEndingDialog, on a frozen draft whose demand moved', () => {
  it('offers no assignment to a customer order cancelled since the freeze, and says what was riding on it (AC-18)', async () => {
    const user = userEvent.setup();
    const onSubmit = succeeds();
    openDialog(onSubmit, vi.fn(), frozenDraft);

    const dialog = await arrivalDialog();
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
    await answerConformanceHonoured(user, dialog);
    await user.click(submitButton(dialog));

    // Nothing is sent for the cancelled link, so the ending cannot be refused
    // for an assignment the member was never offered.
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        receivedQuantity: 1180,
        allocations: [
          { purchaseDraftLineLinkId: ids.linkOne, allocatedQuantity: 1000 },
        ],
        preReceiptConformance: { verdict: 'met' },
      }),
    );
  });

  it('groups every quantity it renders, and names the customer an assignment fulfils (AC-17a)', async () => {
    const user = userEvent.setup();
    openDialog(succeeds(), vi.fn(), frozenDraft);

    const dialog = await arrivalDialog();
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

    const summary = within(dialog).getByRole('status', {
      name: /assignment total.*WH-100420/iu,
    });
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
      .fn<(input: PurchaseDraftLineArrival) => Promise<MutationResult>>()
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

    const dialog = await arrivalDialog();
    await user.type(
      within(dialog).getByLabelText(/assign to Nordwind Logistik GmbH/iu),
      '1100',
    );
    await answerConformanceHonoured(user, dialog);
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
