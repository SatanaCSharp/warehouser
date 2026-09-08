import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it } from 'vitest';

import { ClosedPurchaseDraftLine } from 'modules/purchase-draft/components/ClosedPurchaseDraftLine';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type {
  PackagingType,
  PurchaseDraftLine,
  PurchaseDraftLineRejection,
} from '@warehouser/contracts/purchase-drafts';

// T17 — `Inspection/Closed Line` (`FYfEa`, design-handoff.md § Component
// mapping), derived from the shipped `Delivery/Draft Line` (`jnl1h`,
// `PurchaseDraftLineEditor.tsx`, untouched). Renders the `CONDITION ON
// ARRIVAL` block a closed line carries, in every shape `spec.md` §5 and §6.1
// describe:
//
//   AC-21  — the full account: every refused quantity beside its Reason,
//            description, Source and Disposition, with ordered/presented/
//            accepted/rejected.
//   AC-22  — the cause-withheld account leaves **no trace**: one total
//            refused figure, and nothing else — no placeholder, no count,
//            no greyed row (spec.md §6.1 abuse cases, sad.md §4).
//   AC-23  — the Packaging Type shown is the one frozen on the line, not a
//            later catalogue reading.
//   AC-23a — a Reason renders as recorded, unchanged by a catalogue
//            extension.
//
// Plus the pre-release absent case (`condition: null`, spec.md §8 tenth
// open question) and the static — never live — rendering of the summary
// (design-handoff.md § Component mapping: "In the ending dialog it is a
// live region, replacing nothing … here" implies the read is not one).

const packagingTypes: PackagingType[] = [
  { id: 'cartons', label: 'Cartons' },
  { id: 'pallets', label: 'Pallets' },
];

const rejectionOf = (
  overrides: Partial<PurchaseDraftLineRejection> = {},
): PurchaseDraftLineRejection => ({
  id: '00000000-0000-4000-8000-000000000501',
  rejectionReasonId: 'damaged_by_packing',
  rejectionReasonLabel: 'Damaged by packing',
  quantity: 5,
  source: 'inspected',
  description: 'Two pallets were crushed in transit.',
  disposition: 'held_for_return',
  raisedByUserId: '00000000-0000-4000-8000-000000000601',
  raisedAt: '2026-09-01T09:00:00.000Z',
  amendedByUserId: null,
  amendedAt: null,
  ...overrides,
});

const closedLine = (
  overrides: Partial<PurchaseDraftLine> = {},
): PurchaseDraftLine => ({
  id: '00000000-0000-4000-8000-000000000201',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  orderedQuantity: 100,
  packagingTypeId: 'cartons',
  valueAddingNote: null,
  ending: {
    kind: 'arrival',
    quantity: 100,
    recordedByUserId: '00000000-0000-4000-8000-000000000601',
    recordedAt: '2026-09-01T09:00:00.000Z',
    condition: {
      acceptedQuantity: 95,
      rejectedQuantity: 5,
      preReceiptConformance: { verdict: 'not_applicable', note: null },
      rejections: [rejectionOf()],
    },
  },
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: 'Test Warehouse North, Test Industrial Estate',
    accessNotes: null,
    frozen: true,
  },
  customerDestination: null,
  links: [],
  ...overrides,
});

const renderLine = (
  line: PurchaseDraftLine,
  options: {
    catalogue?: PackagingType[];
    permissionIds?: readonly PermissionId[];
  } = {},
): void => {
  const {
    catalogue = packagingTypes,
    permissionIds = Object.values(PermissionId),
  } = options;
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
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

  renderInEnteredWarehouse(
    <ul>
      <ClosedPurchaseDraftLine
        index={1}
        line={line}
        packagingTypes={catalogue}
        purchaseDraftId={accessIds.warehouse}
      />
    </ul>,
    store,
  );
};

const conditionRegion = (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: /condition/iu });

/** A text node that is *only* a placeholder — an em dash, en dash, bare
 * hyphen, or "N/A" — never a dash or hyphen occurring inside ordinary
 * sentence copy. AC-22 (spec.md §6.1) forbids a placeholder standing in for
 * withheld content, not the character a placeholder happens to be spelled
 * with; the approved design itself renders sentences with an em dash
 * (`Packaging type — Pallet, shrink-wrapped`), and those must keep passing. */
const STANDALONE_PLACEHOLDER = /^(?:—|–|-|n\/a)$/iu;

const standalonePlaceholders = (region: HTMLElement): string[] => {
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent ?? '').trim();
    if (STANDALONE_PLACEHOLDER.test(text)) {
      found.push(text);
    }
    node = walker.nextNode();
  }
  return found;
};

describe('ClosedPurchaseDraftLine — AC-21 full shape', () => {
  it('renders ordered, presented, accepted and rejected, with each refusal beside its reason, description, source and disposition', async () => {
    renderLine(closedLine());

    const region = await conditionRegion();
    // Ordered and presented are both 100 on this fixture, so two nodes carry
    // that figure — asserting the count keeps this from silently degrading to
    // "some 100 renders somewhere".
    expect(within(region).getAllByText('100')).toHaveLength(2);
    expect(within(region).getByText('5')).toBeInTheDocument(); // rejected
    expect(within(region).getByText('95')).toBeInTheDocument(); // accepted

    expect(
      within(region).getByText(/damaged by packing/iu),
    ).toBeInTheDocument();
    expect(
      within(region).getByText('Two pallets were crushed in transit.'),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/inspected at your dock/iu),
    ).toBeInTheDocument();
    expect(within(region).getByText(/held for return/iu)).toBeInTheDocument();
  });

  it('reads the CONDITION ON ARRIVAL heading on an arrival line', async () => {
    renderLine(closedLine());
    expect(
      await screen.findByRole('region', { name: /condition on arrival/iu }),
    ).toBeInTheDocument();
  });

  it('renders a condition heading naming condition on a direct-delivery line', async () => {
    renderLine(
      closedLine({
        deliveryMode: 'direct_to_customer',
        warehouseDestination: null,
        customerDestination: {
          customerDeliveryAddressId: '00000000-0000-4000-8000-000000000701',
          customerId: '00000000-0000-4000-8000-000000000702',
          customerName: 'Nordwind Logistik GmbH',
          addressText: 'Nordwind DC, 12 Handelsweg',
          accessNotes: null,
          frozen: true,
        },
        ending: {
          kind: 'direct_delivery',
          quantity: 100,
          recordedByUserId: '00000000-0000-4000-8000-000000000601',
          recordedAt: '2026-09-01T09:00:00.000Z',
          condition: {
            acceptedQuantity: 95,
            rejectedQuantity: 5,
            preReceiptConformance: { verdict: 'not_applicable', note: null },
            rejections: [rejectionOf({ source: 'customer_reported' })],
          },
        },
      }),
    );

    expect(
      await screen.findByRole('region', { name: /condition/iu }),
    ).toBeInTheDocument();
  });

  // T17 gap 1 — the RED left the present-case conformance rendering
  // unasserted (only the absent case, below, was pinned): the handoff fixes
  // the copy for the editing dialog and one Accessibility example
  // ("Supplier's instruction — Not met") but no rendering test for the
  // *read* surface. Settled here: the recorded verdict renders beside its
  // own wording, and a `not_met` verdict's note is the member's own recorded
  // text — never canned copy, never dropped.
  it('renders the recorded conformance verdict and the member’s own note under Not met', async () => {
    renderLine(
      closedLine({
        ending: {
          kind: 'arrival',
          quantity: 100,
          recordedByUserId: '00000000-0000-4000-8000-000000000601',
          recordedAt: '2026-09-01T09:00:00.000Z',
          condition: {
            acceptedQuantity: 95,
            rejectedQuantity: 5,
            preReceiptConformance: {
              verdict: 'not_met',
              note: 'Delivered loose, no pallets and no customer barcode.',
            },
            rejections: [rejectionOf()],
          },
        },
      }),
    );

    const region = await conditionRegion();
    expect(within(region).getByText(/not met/iu)).toBeInTheDocument();
    expect(
      within(region).getByText(
        'Delivered loose, no pallets and no customer barcode.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a Met verdict with its own wording, never the Not met copy', async () => {
    renderLine(
      closedLine({
        ending: {
          kind: 'arrival',
          quantity: 100,
          recordedByUserId: '00000000-0000-4000-8000-000000000601',
          recordedAt: '2026-09-01T09:00:00.000Z',
          condition: {
            acceptedQuantity: 100,
            rejectedQuantity: 0,
            preReceiptConformance: { verdict: 'met', note: null },
          },
        },
      }),
    );

    const region = await conditionRegion();
    expect(within(region).getByText(/\bmet\b/iu)).toBeInTheDocument();
    expect(within(region).queryByText(/not met/iu)).toBeNull();
  });

  it('never renders the condition summary as a live region here — that stays the ending dialog’s', async () => {
    renderLine(closedLine());

    await conditionRegion();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live]')).toBeNull();
  });

  it('never renders an editable control on a closed line — read-only, kebab excepted', async () => {
    renderLine(closedLine());

    await conditionRegion();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /refuse some of this/iu }),
    ).not.toBeInTheDocument();
  });
});

describe('ClosedPurchaseDraftLine — the pre-release absent case', () => {
  it('renders neither a condition block nor a conformance block when the ending predates this release', async () => {
    renderLine(
      closedLine({
        ending: {
          kind: 'arrival',
          quantity: 100,
          recordedByUserId: '00000000-0000-4000-8000-000000000601',
          recordedAt: '2025-01-01T09:00:00.000Z',
          condition: null,
        },
      }),
    );

    await screen.findByText('WH-100420', { exact: false });
    expect(
      screen.queryByRole('region', { name: /condition/iu }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/refused/iu)).not.toBeInTheDocument();
  });
});

/** The condition region's own text, with every refusal row removed — what is
 * left is the heading and the summary, which AC-22 requires to read
 * identically whether or not a cause is present. */
const outlineWithoutRows = (region: HTMLElement): string => {
  const clone = region.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('li, ul, [role="list"], [role="listitem"]')
    .forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/gu, ' ').trim();
};

describe('ClosedPurchaseDraftLine — AC-22 the cause-withheld shape leaves no trace', () => {
  const withheldLine = closedLine({
    ending: {
      kind: 'arrival',
      quantity: 100,
      recordedByUserId: '00000000-0000-4000-8000-000000000601',
      recordedAt: '2026-09-01T09:00:00.000Z',
      condition: {
        acceptedQuantity: 95,
        rejectedQuantity: 5,
        preReceiptConformance: { verdict: 'not_applicable', note: null },
        // No `rejections` property at all — the withheld shape
        // (`lineConditionCauseWithheldSchema`) never carries one.
      },
    },
  });

  it('still shows the one total refused figure — the fact of a refusal is never withheld', async () => {
    renderLine(withheldLine);

    const region = await conditionRegion();
    expect(within(region).getByText('5')).toBeInTheDocument(); // rejected total
    expect(within(region).getByText('95')).toBeInTheDocument(); // accepted
    // Presented and accepted differ, which is what keeps the fact visible.
    expect(within(region).getAllByText('100')).not.toHaveLength(0);
  });

  it('renders no reason, description, source, disposition or kebab — no trace of what was withheld', async () => {
    renderLine(withheldLine);

    const region = await conditionRegion();
    expect(within(region).queryByText(/damaged by packing/iu)).toBeNull();
    expect(
      within(region).queryByText('Two pallets were crushed in transit.'),
    ).toBeNull();
    expect(within(region).queryByText(/inspected at your dock/iu)).toBeNull();
    expect(within(region).queryByText(/held for return/iu)).toBeNull();
    expect(
      within(region).queryByRole('button', {
        name: /actions for the refusal/iu,
      }),
    ).toBeNull();
    // No list of refusals at all — not an empty one, not a disabled one.
    expect(within(region).queryByRole('list')).toBeNull();
  });

  it('hints nothing was withheld: no standalone placeholder, count or "hidden" wording in the condition region', async () => {
    renderLine(withheldLine);

    const region = await conditionRegion();
    // A text node that is *only* a placeholder — an em dash, en dash, bare
    // hyphen, or "N/A" — standing where refusal content would otherwise
    // render is the disclosure spec.md §6.1 forbids. An em dash inside
    // ordinary copy (the approved design's own "Packaging type — Pallet,
    // shrink-wrapped") is not that, and is not banned here: banning the
    // character itself would ban legitimate copy the design uses freely,
    // which is broader than the acceptance criterion and was previously
    // distorting this component's own conformance copy and its choice of
    // which shipped component to reuse for the SERVES rows.
    expect(standalonePlaceholders(region)).toEqual([]);
    const bannedWording =
      /hidden|withheld|redacted|1 refusal|separate refusal/iu;
    expect(region.textContent).not.toMatch(bannedWording);
  });

  // The sharpest form of AC-22: the withheld reading of a line and the full
  // reading of a line that genuinely carries exactly **one** refusal for the
  // same figures render identical accessible trees once the refusal list
  // itself is set aside — proving the withheld path adds no marker of its
  // own rather than merely omitting the fields this test file already checks
  // one at a time above.
  it('renders indistinguishably from a line carrying one unexplained refusal, except for the figures already asserted equal', async () => {
    renderLine(withheldLine);
    const withheldRegion = await conditionRegion();
    const withheldOutline = outlineWithoutRows(withheldRegion);
    cleanup();

    renderLine(
      closedLine({
        ending: {
          kind: 'arrival',
          quantity: 100,
          recordedByUserId: '00000000-0000-4000-8000-000000000601',
          recordedAt: '2026-09-01T09:00:00.000Z',
          condition: {
            acceptedQuantity: 95,
            rejectedQuantity: 5,
            preReceiptConformance: { verdict: 'not_applicable', note: null },
            rejections: [rejectionOf({ quantity: 5 })],
          },
        },
      }),
    );
    const explainedRegion = await conditionRegion();
    const explainedOutline = outlineWithoutRows(explainedRegion);

    expect(withheldOutline).toEqual(explainedOutline);
  });
});

describe('ClosedPurchaseDraftLine — AC-23 the frozen Packaging Type', () => {
  it('renders the type frozen on the line, unmoved by a catalogue extended afterwards', async () => {
    // `extendedCatalogue` carries an entry the catalogue only gained after
    // the freeze — a real extension, appended rather than replacing
    // anything the line already named.
    const extendedCatalogue: PackagingType[] = [
      ...packagingTypes,
      { id: 'shrink_wrap', label: 'Shrink wrap' },
    ];

    renderLine(closedLine({ packagingTypeId: 'cartons' }), {
      catalogue: extendedCatalogue,
    });

    expect(await screen.findByText('Cartons')).toBeInTheDocument();
    expect(screen.queryByText('Shrink wrap')).not.toBeInTheDocument();
  });
});

describe('ClosedPurchaseDraftLine — AC-23a a Reason unchanged by a catalogue extension', () => {
  it('renders the reason the member stated, not a later reading of the catalogue', async () => {
    renderLine(
      closedLine({
        ending: {
          kind: 'arrival',
          quantity: 100,
          recordedByUserId: '00000000-0000-4000-8000-000000000601',
          recordedAt: '2026-09-01T09:00:00.000Z',
          condition: {
            acceptedQuantity: 95,
            rejectedQuantity: 5,
            preReceiptConformance: { verdict: 'not_applicable', note: null },
            // Recorded before the catalogue gained a reason with a
            // deceptively similar wording — the component has no catalogue
            // to consult at all for this: `rejectionReasonLabel` already
            // carries the wording recorded at the time.
            rejections: [
              rejectionOf({
                rejectionReasonId: 'unfit_other',
                rejectionReasonLabel: 'Unfit — other',
                description: 'Smelled of solvent.',
              }),
            ],
          },
        },
      }),
    );

    expect(await screen.findByText(/unfit — other/iu)).toBeInTheDocument();
  });
});

describe('ClosedPurchaseDraftLine — the four projection shapes', () => {
  const identifiedLinks: PurchaseDraftLine['links'] = [
    {
      id: '00000000-0000-4000-8000-000000000301',
      customerOrderId: '00000000-0000-4000-8000-000000000401',
      customer: null,
      customerName: 'Nordwind Logistik GmbH',
      statedQuantity: 100,
      snapshot: null,
      current: {
        quantity: 100,
        neededBy: '2026-09-01',
        state: 'unfulfilled',
        outstandingQuantity: 100,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
  ];

  const redactedLinks: PurchaseDraftLine['links'] = [
    {
      id: identifiedLinks[0]?.id ?? '',
      customerOrderId: identifiedLinks[0]?.customerOrderId ?? '',
      statedQuantity: 100,
      driftSignals: [],
      allocation: null,
      snapshot: null,
      current: {
        quantity: 100,
        neededBy: '2026-09-01',
        state: 'unfulfilled',
        outstandingQuantity: 100,
        lastChangedAt: null,
      },
    },
  ];

  const withCauseCondition = {
    acceptedQuantity: 95,
    rejectedQuantity: 5,
    preReceiptConformance: { verdict: 'not_applicable', note: null } as const,
    rejections: [rejectionOf()],
  };

  const causeWithheldCondition = {
    acceptedQuantity: 95,
    rejectedQuantity: 5,
    preReceiptConformance: { verdict: 'not_applicable', note: null } as const,
  };

  // T17 gap 3 — the RED's own four-shape matrix asserted only the figures,
  // on the claim that the customer-identity half is already proven by
  // earlier tasks' tests on `PurchaseDraftLineLinks`. Verified: no spec file
  // in the repository exercises `purchaseDraftLinkIdentity` or
  // `PurchaseDraftLinkIdentity` at all (`git grep` across `**/*.spec.ts(x)`
  // returns nothing), and `PurchaseDraftLineDirectory.spec.tsx`'s own AC-09a
  // coverage exercises `customerDestination` redaction, a different field,
  // never a link's `customer`/`customerName`. The claim does not hold, so
  // identity is asserted here — on the one surface where a closed line's
  // identity and cause redactions can be observed to compose correctly.
  const identityAssertion: Record<'identified' | 'redacted', () => void> = {
    identified: () => {
      expect(screen.getByText('Nordwind Logistik GmbH')).toBeInTheDocument();
      expect(
        screen.queryByText('Customer identity is withheld from you.'),
      ).not.toBeInTheDocument();
    },
    redacted: () => {
      expect(
        screen.getByText('Customer identity is withheld from you.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Nordwind Logistik GmbH'),
      ).not.toBeInTheDocument();
    },
  };

  it.each([
    ['cause and identity', identifiedLinks, withCauseCondition, 'identified'],
    ['cause only', redactedLinks, withCauseCondition, 'redacted'],
    ['identity only', identifiedLinks, causeWithheldCondition, 'identified'],
    ['neither', redactedLinks, causeWithheldCondition, 'redacted'],
  ] as const)(
    'renders the %s shape with the correct figures, correct identity, and no crash',
    async (_label, links, condition, identity) => {
      renderLine(
        closedLine({
          links,
          ending: {
            kind: 'arrival',
            quantity: 100,
            recordedByUserId: '00000000-0000-4000-8000-000000000601',
            recordedAt: '2026-09-01T09:00:00.000Z',
            condition,
          },
        }),
      );

      const region = await conditionRegion();
      expect(within(region).getByText('5')).toBeInTheDocument();
      expect(within(region).getByText('95')).toBeInTheDocument();
      identityAssertion[identity]();
    },
  );
});

// T18 — `Modal · Amend this refusal` (`iNstk`), opened from this closed line's
// own read row (`web-action-dialogs.md`, ADR
// `27-08-2026-reducer-driven-action-dialogs.md`). The `Kind` union and its
// `useActionDialog` controller belong to *this* surface, not to
// `PurchaseDraftLineRefusalRow`, which only reports the event upward — so the
// wiring end to end is proven here, not on the row in isolation.

const CLOSED_LINE_SOURCE_PATH = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'ClosedPurchaseDraftLine.tsx',
);

const closedLineSource = (): string =>
  readFileSync(CLOSED_LINE_SOURCE_PATH, 'utf8');

describe('ClosedPurchaseDraftLine — T18 structural: the amend dialog is opened through the shared mechanism, never by hand', () => {
  it('uses useActionDialog and ActionDialogHost — the mechanism this surface must take rather than a Modal root or a hand-rolled null check', () => {
    const source = closedLineSource();

    expect(source).toMatch(/useActionDialog/u);
    expect(source).toMatch(/ActionDialogHost/u);
  });

  it('hands the dialog no onClose and keeps no isOpen anywhere in this surface (web-action-dialogs.md §4)', () => {
    const source = closedLineSource();

    // A surface that reintroduces either of these has gone back to the
    // pattern the reducer replaced — a boolean beside the controller that can
    // disagree with it, or a dialog closing itself through a prop the guide
    // forbids handing it. This is the "no surface hands a dialog an onClose;
    // none keeps an isOpen" rule made a fact about this file rather than an
    // aspiration in its comments.
    expect(source).not.toMatch(/onClose/u);
    expect(source).not.toMatch(/isOpen/u);
  });
});

describe('ClosedPurchaseDraftLine — opening and dismissing the amend dialog end to end', () => {
  const decidedRejectionLine = closedLine({
    ending: {
      kind: 'arrival',
      quantity: 100,
      recordedByUserId: '00000000-0000-4000-8000-000000000601',
      recordedAt: '2026-09-01T09:00:00.000Z',
      condition: {
        acceptedQuantity: 95,
        rejectedQuantity: 5,
        preReceiptConformance: { verdict: 'not_applicable', note: null },
        rejections: [
          rejectionOf({
            description: 'Two pallets were crushed in transit.',
            disposition: 'held_for_return',
          }),
        ],
      },
    },
  });

  it('opens the FormModalDialog pre-filled from the kebab, for a member holding REJECTIONS:UPDATE', async () => {
    const user = userEvent.setup();
    renderLine(decidedRejectionLine, {
      permissionIds: [
        PermissionId.PURCHASE_DRAFTS_WATCH,
        PermissionId.REJECTIONS_WATCH,
        PermissionId.REJECTIONS_UPDATE,
      ],
    });

    const kebab = await screen.findByRole('button', {
      name: /actions for the refusal of 5 damaged by packing/iu,
    });
    await user.click(kebab);
    await user.click(
      await screen.findByRole('menuitem', { name: /amend this refusal/iu }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByLabelText(/description/iu, {
        selector: 'textarea',
      }),
    ).toHaveValue('Two pallets were crushed in transit.');

    await user.keyboard('{Escape}');
    await screen.findByText(/damaged by packing/iu); // the row survived the round trip
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // React Aria restores focus to the trigger asynchronously, after the
    // dialog has already unmounted — neither await above is that restore, so
    // this has to poll for it rather than read it synchronously.
    await waitFor(() => expect(kebab).toHaveFocus());
  });

  it('offers no amend action at all for a member lacking REJECTIONS:UPDATE (AC-20)', async () => {
    renderLine(decidedRejectionLine, {
      permissionIds: [
        PermissionId.PURCHASE_DRAFTS_WATCH,
        PermissionId.REJECTIONS_WATCH,
      ],
    });

    await screen.findByText(/damaged by packing/iu);
    expect(
      screen.queryByRole('button', { name: /actions for the refusal/iu }),
    ).not.toBeInTheDocument();
  });
});
