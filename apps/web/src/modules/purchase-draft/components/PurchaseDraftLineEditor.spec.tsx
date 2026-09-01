import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { itemApi } from 'modules/item/api/item-api';
import { PurchaseDraftLineEditor } from 'modules/purchase-draft/components/PurchaseDraftLineEditor';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  ARCHIVED_WAREHOUSE_REASON_ID,
  useArchivedWarehouse,
} from 'shared/hooks/projections/useArchivedWarehouse';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type {
  PackagingType,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

// T20 DoD:
// - "A test proves a frozen line uses the HeroUI disabled field treatment
//   and exposes the reason, never a read-only lookalike, and that no frozen
//   control is submittable" (AC-15).
// - "A test proves per-line Packaging Type and Value-adding Note both
//   render when the draft is opened" (AC-12).
//
// The line now composes its own `SERVES` section, whose mutations reach the
// store, so the subject renders inside an entered Warehouse rather than bare.
//
// The archived-Warehouse projection is stubbed the way `ArchivedWarehouseChip`
// and `DemandDirectory` stub it: the verdict read itself is covered by
// `useArchivedWarehouse.spec`, and what matters here is only what a line does
// with the answer. The **Permission** projection is not stubbed: AC-22 is what
// this file was missing entirely, so it is exercised through the real gate,
// against the projection the actor under test actually holds
// (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).

vi.mock('shared/hooks/projections/useArchivedWarehouse', async () => {
  const actual = await vi.importActual<
    typeof import('shared/hooks/projections/useArchivedWarehouse')
  >('shared/hooks/projections/useArchivedWarehouse');
  return { ...actual, useArchivedWarehouse: vi.fn() };
});

const inArchivedWarehouse = (isArchived: boolean): void => {
  vi.mocked(useArchivedWarehouse).mockReturnValue({
    isArchived,
    reasonId: isArchived ? ARCHIVED_WAREHOUSE_REASON_ID : undefined,
  });
};

const FROZEN_REASON =
  'Frozen — the draft records what the supplier was told and only Arrival Confirmation and closure can still write to it.';
const ARCHIVED_REASON =
  'This warehouse has been archived, so nothing on this draft can be changed any more.';
const UNPERMITTED_REASON =
  'Your role does not allow purchase drafts to be changed in this warehouse, so this is shown as it stands.';

const WATCH_ONLY = [PermissionId.PURCHASE_DRAFTS_WATCH] as const;

const packagingTypes: PackagingType[] = [
  { id: 'cartons', label: 'Cartons' },
  { id: 'pallets', label: 'Pallets' },
];

const line = (
  overrides: Partial<PurchaseDraftLine> = {},
): PurchaseDraftLine => ({
  id: '00000000-0000-4000-8000-000000000201',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  orderedQuantity: 400,
  packagingTypeId: 'cartons',
  valueAddingNote: 'Label each carton for Nordwind',
  receivedQuantity: null,
  links: [],
  ...overrides,
});

const linkedLine = line({
  links: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      customerOrderId: '00000000-0000-4000-8000-000000000401',
      customerName: 'Nordwind Logistik GmbH',
      statedQuantity: 400,
      snapshot: null,
      current: {
        quantity: 400,
        neededBy: '2026-09-01',
        state: 'unfulfilled',
        outstandingQuantity: 400,
        lastChangedAt: null,
      },
      driftSignals: [],
      allocation: null,
    },
  ],
});

const catalogueItem = (deactivatedAt: string | null): Item => ({
  id: line().itemId,
  sku: 'WH-100420',
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  onHandQuantity: 0,
  deactivatedAt,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 1,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
});

type Recorded = { url: string; init?: RequestInit };

/**
 * Records every request the line issues while `stubAccessServer`'s in-memory
 * backend keeps answering the access projection. A control that "stays usable"
 * is only proven usable by the request it makes: the case this replaced
 * clicked unlink and then asserted an unrelated field was still enabled, which
 * passed identically with a handler that did nothing.
 */
const recordRequests = (): Recorded[] => {
  const served = globalThis.fetch;
  const recorded: Recorded[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      recorded.push({
        url: String(input instanceof Request ? input.url : input),
        init,
      });
      return served(input, init);
    }),
  );

  return recorded;
};

type EditorOptions = {
  items?: Item[];
  permissionIds?: readonly PermissionId[];
};

const renderEditor = (
  subject: ReactElement,
  {
    items = [],
    permissionIds = Object.values(PermissionId),
  }: EditorOptions = {},
): Recorded[] => {
  stubAccessServer({ permissionIds });
  const recorded = recordRequests();
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
  void store.dispatch(
    itemApi.util.upsertQueryData('listItems', accessIds.warehouse, items),
  );

  renderInEnteredWarehouse(<ul>{subject}</ul>, store);
  return recorded;
};

const editor = (
  isFrozen: boolean,
  subjectLine: PurchaseDraftLine = line(),
): ReactElement => (
  <PurchaseDraftLineEditor
    index={1}
    isFrozen={isFrozen}
    line={subjectLine}
    packagingTypes={packagingTypes}
    purchaseDraftId={accessIds.warehouse}
    onRemoveLine={vi.fn()}
    onReviseLine={vi.fn()}
  />
);

const unlinkUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts/${accessIds.warehouse}/lines/${line().id}/links/${linkedLine.links[0]?.id ?? ''}`;

const itemField = (): HTMLElement => screen.getByLabelText('Item');
const removeLine = (): HTMLElement | null =>
  screen.queryByRole('button', { name: 'Remove line 1' });
const unlink = (): HTMLElement | null =>
  screen.queryByRole('button', {
    name: 'Remove Nordwind Logistik GmbH from this line',
  });

describe('PurchaseDraftLineEditor', () => {
  beforeEach(() => {
    inArchivedWarehouse(false);
  });

  afterEach(() => {
    vi.mocked(useArchivedWarehouse).mockReset();
    vi.unstubAllGlobals();
  });

  it('renders the Packaging Type and the Value-adding Note when the draft is opened', async () => {
    renderEditor(editor(false));

    expect(
      await screen.findByRole('button', { name: /packaging type/iu }),
    ).toHaveTextContent('Cartons');
    expect(screen.getByLabelText('Value-adding note')).toHaveValue(
      'Label each carton for Nordwind',
    );
  });

  // `yGhkK`/`F0SpRx` draw the note as a note box, not a one-line input: it
  // holds a whole instruction, and a single-line `<input>` shows a member only
  // the tail of what they typed.
  it('gives the Value-adding Note a multi-line field, as the frames draw it (AC-12)', async () => {
    renderEditor(editor(false));

    expect((await screen.findByLabelText('Value-adding note')).tagName).toBe(
      'TEXTAREA',
    );
  });

  it('disables every control and exposes the reason on a frozen line, never a read-only lookalike', async () => {
    renderEditor(editor(true));

    expect(await screen.findByLabelText('Quantity')).toBeDisabled();
    expect(screen.getByLabelText('Packaging type')).toBeDisabled();
    expect(screen.getByLabelText('Value-adding note')).toBeDisabled();
    expect(itemField()).toBeDisabled();
    expect(removeLine()).toBeDisabled();
    // The reason is exposed, not merely implied by disabled controls.
    expect(screen.getAllByText(FROZEN_REASON).length).toBeGreaterThan(0);
  });

  it('keeps every control enabled and submittable while the draft is still Draft', async () => {
    renderEditor(editor(false));

    expect(await screen.findByLabelText('Quantity')).toBeEnabled();
    expect(screen.getByLabelText('Packaging type')).toBeEnabled();
    expect(screen.getByLabelText('Value-adding note')).toBeEnabled();
  });

  it('names the unit the quantity is counted in, beside the field', async () => {
    renderEditor(editor(false));

    expect(await screen.findByText('pieces')).toBeInTheDocument();
  });

  it('disables the unlink control and the intended quantity on a frozen line (AC-15)', async () => {
    renderEditor(editor(true, linkedLine));

    expect(
      await screen.findByRole('button', {
        name: 'Remove Nordwind Logistik GmbH from this line',
      }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Was intended for')).toBeDisabled();
  });

  it('unlinks the customer while the line is still editable, by issuing the request', async () => {
    const user = userEvent.setup();
    const recorded = renderEditor(editor(false, linkedLine));

    await screen.findByLabelText('Intended for them');
    expect(unlink()).toBeEnabled();
    await user.click(unlink() as HTMLElement);

    await waitFor(() =>
      expect(
        recorded.filter(
          ({ url, init }) => url === unlinkUrl && init?.method === 'DELETE',
        ),
      ).toHaveLength(1),
    );
  });

  /**
   * AC-06d — the server keeps a line naming a since-deactivated Item fully
   * editable, and `ItemPicker` offers active Items only. Handed that list the
   * field had no option matching its own value and rendered blank, so the line
   * read as naming nothing.
   */
  describe('a line whose Item was deactivated afterwards (AC-06d)', () => {
    it('still names the Item, and says it is no longer offered', async () => {
      renderEditor(editor(false), {
        items: [catalogueItem('2026-08-20T09:00:00.000Z')],
      });

      expect(await screen.findByLabelText('Item')).toHaveTextContent(
        'WH-100420 · Pallet wrap, 500mm — no longer offered',
      );
    });

    it('names an active Item plainly, from the catalogue', async () => {
      renderEditor(editor(false), { items: [catalogueItem(null)] });

      expect(await screen.findByLabelText('Item')).toHaveTextContent(
        'WH-100420 · Pallet wrap, 500mm',
      );
      expect(itemField()).not.toHaveTextContent('no longer offered');
    });

    // A catalogue that has not arrived is not a catalogue that refuses the
    // Item, so the line names it from its own `itemSku`/`itemDescription`
    // rather than claiming anything about what is offered.
    it('names the Item from the line itself before the catalogue arrives', async () => {
      renderEditor(editor(false), { items: [] });

      expect(await screen.findByLabelText('Item')).toHaveTextContent(
        'WH-100420 · Pallet wrap, 500mm',
      );
      expect(itemField()).not.toHaveTextContent('no longer offered');
    });
  });

  /**
   * AC-22 — the Permission decides what is *offered*, and this destination had
   * none of it below the five triggers: every field and both destructive
   * controls were enabled for an actor holding `PURCHASE_DRAFTS:WATCH` alone,
   * and each edit 403'd into a generic toast.
   *
   * The two treatments are deliberate and different. A field states what the
   * draft says, so it stays and is disabled with its reason — withholding it
   * would withhold the draft. A control that only writes is withheld, like
   * `Add a line` and `Link a customer order` beside it.
   */
  describe('an actor holding PURCHASE_DRAFTS:WATCH alone (AC-22)', () => {
    it('shows every field of the line, disabled, stating that the Role refuses it', async () => {
      renderEditor(editor(false, linkedLine), { permissionIds: WATCH_ONLY });

      expect(await screen.findAllByText(UNPERMITTED_REASON)).not.toHaveLength(
        0,
      );
      expect(itemField()).toBeDisabled();
      expect(screen.getByLabelText('Quantity')).toBeDisabled();
      expect(screen.getByLabelText('Packaging type')).toBeDisabled();
      expect(screen.getByLabelText('Value-adding note')).toBeDisabled();
      expect(screen.getByLabelText('Intended for them')).toBeDisabled();
      expect(itemField()).toHaveAccessibleDescription(UNPERMITTED_REASON);
    });

    it('withholds the destructive controls rather than offering them refused', async () => {
      renderEditor(editor(false, linkedLine), { permissionIds: WATCH_ONLY });

      await screen.findAllByText(UNPERMITTED_REASON);
      expect(removeLine()).not.toBeInTheDocument();
      expect(unlink()).not.toBeInTheDocument();
    });

    // The frozen and archived facts refuse the write to everyone, so they are
    // what a member is told about even when their Role would refuse it too.
    it('states the frozen reason ahead of the Role’s, because that refuses everyone', async () => {
      renderEditor(editor(true, linkedLine), { permissionIds: WATCH_ONLY });

      expect(await screen.findAllByText(FROZEN_REASON)).not.toHaveLength(0);
      expect(screen.queryAllByText(UNPERMITTED_REASON)).toHaveLength(0);
    });
  });

  // AC-15 and AC-23 both require the refused control to stay visible and
  // disabled **with its reason stated**. Stating it visibly is only half: a
  // control that carries no programmatic description announces nothing at all,
  // and one that points at the wrong sentence announces a reason the member
  // cannot see. `toHaveAccessibleDescription` resolves `aria-describedby`
  // exactly as an assistive technology does, so it fails on both.
  describe('the reason a refused control announces', () => {
    it('gives the Item picker the same stated reason its three sibling fields carry (AC-15)', async () => {
      renderEditor(editor(true));

      expect(await screen.findByLabelText('Item')).toBeDisabled();
      expect(itemField()).toHaveAccessibleDescription(FROZEN_REASON);
    });

    it('states the frozen reason on the line’s own controls in a Warehouse still in operation (AC-15)', async () => {
      renderEditor(editor(true, linkedLine));

      await screen.findByLabelText('Item');
      expect(removeLine()).toBeDisabled();
      expect(removeLine()).toHaveAccessibleDescription(FROZEN_REASON);
      expect(unlink()).toBeDisabled();
      expect(unlink()).toHaveAccessibleDescription(FROZEN_REASON);
    });

    it('announces the frozen reason, not the archived one, when both hold (AC-15 over AC-23)', async () => {
      inArchivedWarehouse(true);
      renderEditor(editor(true, linkedLine));

      // `write-refusal.ts` ranks frozen first, so frozen is what the line
      // draws — and therefore the only thing it may announce.
      expect(await screen.findAllByText(FROZEN_REASON)).not.toHaveLength(0);
      expect(screen.queryAllByText(ARCHIVED_REASON)).toHaveLength(0);

      expect(removeLine()).toHaveAccessibleDescription(FROZEN_REASON);
      expect(unlink()).toHaveAccessibleDescription(FROZEN_REASON);
    });

    it('announces the archived reason on an unfrozen line in an archived Warehouse (AC-23)', async () => {
      inArchivedWarehouse(true);
      renderEditor(editor(false, linkedLine));

      expect(await screen.findAllByText(ARCHIVED_REASON)).not.toHaveLength(0);
      expect(removeLine()).toHaveAccessibleDescription(ARCHIVED_REASON);
      expect(unlink()).toHaveAccessibleDescription(ARCHIVED_REASON);
      expect(itemField()).toHaveAccessibleDescription(ARCHIVED_REASON);
    });

    it('describes nothing while the line accepts writes', async () => {
      renderEditor(editor(false, linkedLine));

      await screen.findByLabelText('Item');
      expect(removeLine()).not.toHaveAccessibleDescription();
      expect(screen.queryAllByText(FROZEN_REASON)).toHaveLength(0);
      expect(screen.queryAllByText(ARCHIVED_REASON)).toHaveLength(0);
      expect(screen.queryAllByText(UNPERMITTED_REASON)).toHaveLength(0);
    });
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `ItemDirectory.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('stacks the field row below md: and lays it out as a row from md: up (ehtEw, O42LHI 390 vs yGhkK 1440)', async () => {
      renderEditor(editor(false));

      const quantityField = await screen.findByLabelText('Quantity');
      const fieldRow = quantityField.closest('div.flex');
      expect(fieldRow?.className).toContain('flex-col');
      expect(fieldRow?.className).toContain('md:flex-row');
    });
  });
});
