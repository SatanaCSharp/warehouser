import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import omit from 'lodash/omit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PurchaseDraftLineDelivery } from 'modules/purchase-draft/components/purchase-draft-line-delivery/PurchaseDraftLineDelivery';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Customer } from '@warehouser/contracts/customers';
import type {
  PurchaseDraftLine,
  PurchaseDraftLineIdentified,
  PurchaseDraftLineRedacted,
  PurchaseDraftLineUpdate,
} from '@warehouser/contracts/purchase-drafts';

// T23 — the `DELIVERY` block of `Delivery/Draft Line` (`jnl1h`), serving the
// editable **and** the frozen line (AC-13, AC-14, AC-17, AC-09a, AC-23).
//
// DoD: "the draft line renders the DELIVERY block with its radiogroup mode
// control at both viewports, and a frozen line uses the HeroUI disabled field
// treatment, not a read-only lookalike"; "delivery mode and ending state are
// total `Record` render lookups"; "identity is withheld without
// `CUSTOMERS:WATCH`"; "archived Warehouses render read-only".

const WAREHOUSE_ADDRESS = 'Hafenstraße 14, 20457 Hamburg';
const WAREHOUSE_ACCESS_NOTES = 'Dock 3; deliveries 07:00-15:00';
const CUSTOMER_ADDRESS = 'Nordkai 8, 21079 Hamburg';
const CUSTOMER_ACCESS_NOTES = 'Gate code on the intercom';
const LOCK_STRIP_ID = 'line-lock-strip';

const ADDRESS_ID = '00000000-0000-4000-8000-000000000301';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000201';

const viaWarehouseLine = (
  overrides: Partial<PurchaseDraftLineIdentified> = {},
): PurchaseDraftLineIdentified => ({
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  orderedQuantity: 400,
  packagingTypeId: null,
  valueAddingNote: null,
  ending: null,
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: WAREHOUSE_ADDRESS,
    accessNotes: WAREHOUSE_ACCESS_NOTES,
    frozen: false,
  },
  customerDestination: null,
  links: [],
  ...overrides,
});

const directLine = (
  overrides: Partial<PurchaseDraftLineIdentified> = {},
): PurchaseDraftLineIdentified =>
  viaWarehouseLine({
    deliveryMode: 'direct_to_customer',
    warehouseDestination: null,
    customerDestination: {
      customerDeliveryAddressId: ADDRESS_ID,
      customerId: CUSTOMER_ID,
      customerName: 'Nordwind Logistik GmbH',
      addressText: CUSTOMER_ADDRESS,
      accessNotes: CUSTOMER_ACCESS_NOTES,
      frozen: false,
    },
    ...overrides,
  });

/**
 * The redacted arm of `PurchaseDraftLine`: `customerDestination` is **absent
 * as a property**, not null, which is what proves the redaction rather than a
 * nulled field (AC-09a).
 */
const redactedDirectLine = (): PurchaseDraftLineRedacted => {
  return {
    ...omit(directLine(), ['customerDestination', 'links']),
    links: [],
  };
};

const customer: Customer = {
  id: CUSTOMER_ID,
  name: 'Nordwind Logistik GmbH',
  deactivatedAt: null,
  mainDeliveryAddressId: ADDRESS_ID,
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
  deliveryAddresses: [
    {
      id: ADDRESS_ID,
      customerId: CUSTOMER_ID,
      addressText: CUSTOMER_ADDRESS,
      accessNotes: CUSTOMER_ACCESS_NOTES,
      isMain: true,
      deactivatedAt: null,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-01T09:00:00.000Z',
    },
  ],
};

type DeliveryOptions = {
  customers?: Customer[];
  isDisabled?: boolean;
  permissionIds?: readonly PermissionId[];
};

const renderDelivery = (
  line: PurchaseDraftLine,
  onReviseLine: (input: PurchaseDraftLineUpdate) => void = vi.fn(),
  {
    customers = [customer],
    isDisabled = false,
    permissionIds = Object.values(PermissionId),
  }: DeliveryOptions = {},
): void => {
  stubAccessServer({ permissionIds });
  const served = globalThis.fetch;
  const customersUrl = `/api/v1/warehouses/${accessIds.warehouse}/customers`;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      return url === customersUrl
        ? Promise.resolve(Response.json(customers))
        : served(input, init);
    }),
  );

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
    <div id={LOCK_STRIP_ID}>
      <PurchaseDraftLineDelivery
        isDisabled={isDisabled}
        line={line}
        reasonId={isDisabled ? LOCK_STRIP_ID : undefined}
        onReviseLine={onReviseLine}
      />
    </div>,
    store,
  );
};

describe('PurchaseDraftLineDelivery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // design-handoff.md §Accessibility: "The delivery-mode control is a real
  // radio group, not two buttons: its accessible name is 'How it travels' and
  // each option announces its own label." There is one control, rendered
  // identically at both viewports, so neither viewport can offer a mode the
  // other does not.
  it('offers the delivery mode as one radiogroup named for what it decides', async () => {
    renderDelivery(viaWarehouseLine());

    const group = await screen.findByRole('radiogroup', {
      name: 'How it travels',
    });

    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(
      screen.getByRole('radio', { name: 'Via warehouse' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Direct to customer' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Via warehouse' })).toBeChecked();
  });

  // AC-17 — a frozen draft records what the supplier was told. The control is
  // HeroUI's own disabled treatment, never a read-only lookalike, and the
  // reason is exposed once for the whole line by the lock strip rather than
  // repeated per field (design-handoff.md §Accessibility).
  it('uses the disabled field treatment on a frozen line, never a read-only lookalike', async () => {
    renderDelivery(viaWarehouseLine(), vi.fn(), { isDisabled: true });

    const group = await screen.findByRole('radiogroup', {
      name: 'How it travels',
    });

    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).not.toHaveAttribute('aria-readonly');
    expect(group).toHaveAttribute('aria-describedby', LOCK_STRIP_ID);
  });

  // AC-10 / AC-22 — the Warehouse's own address and its access notes are the
  // operator's premises data, read under `PURCHASE_DRAFTS:WATCH` alone: a
  // member who prepares the dock may hold no `CUSTOMERS:WATCH` at all.
  it('states the warehouse destination and its access notes without CUSTOMERS:WATCH', async () => {
    renderDelivery(viaWarehouseLine(), vi.fn(), {
      permissionIds: [PermissionId.PURCHASE_DRAFTS_WATCH],
    });

    expect(await screen.findByText(WAREHOUSE_ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(WAREHOUSE_ACCESS_NOTES)).toBeInTheDocument();
  });

  // AC-16a refuses to freeze from this state; it is nonetheless reachable while
  // the draft is in `draft`, and saying nothing would leave a blank where the
  // destination belongs.
  it('says the warehouse has recorded no address rather than rendering a blank', async () => {
    renderDelivery(
      viaWarehouseLine({
        warehouseDestination: {
          addressText: null,
          accessNotes: null,
          frozen: false,
        },
      }),
    );

    expect(
      await screen.findByText(
        'No delivery address is recorded for this warehouse yet.',
      ),
    ).toBeInTheDocument();
  });

  it('states the customer, the address and the access notes of a direct line', async () => {
    renderDelivery(directLine());

    expect(
      await screen.findByText('Nordwind Logistik GmbH'),
    ).toBeInTheDocument();
    expect(screen.getByText(CUSTOMER_ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(CUSTOMER_ACCESS_NOTES)).toBeInTheDocument();
  });

  // AC-09a — the redacted arm omits `customerDestination` entirely, so the
  // block states that identity is withheld and names no customer, address or
  // access note at all.
  it('withholds the customer destination when the actor may not read customers', async () => {
    renderDelivery(redactedDirectLine(), vi.fn(), {
      permissionIds: [PermissionId.PURCHASE_DRAFTS_WATCH],
    });

    expect(
      await screen.findByText('Customer identity is withheld from you.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Nordwind Logistik GmbH'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(CUSTOMER_ADDRESS)).not.toBeInTheDocument();
    expect(screen.queryByText(CUSTOMER_ACCESS_NOTES)).not.toBeInTheDocument();
  });

  // AC-13 — a Via Warehouse line's destination *is* the Warehouse's own
  // address, so returning to it clears the customer address with the mode
  // rather than leaving one behind.
  it('clears the customer address when the line comes back to the dock', async () => {
    const onReviseLine = vi.fn();
    renderDelivery(directLine(), onReviseLine);

    await userEvent.click(
      await screen.findByRole('radio', { name: 'Via warehouse' }),
    );

    expect(onReviseLine).toHaveBeenCalledWith({
      deliveryMode: 'via_warehouse',
      customerDeliveryAddressId: null,
    });
  });

  // AC-13 — `customerDeliveryAddressId` is required with
  // `direct_to_customer`, so the mode alone is not a submittable revision: the
  // write is made once the member has named where the goods travel.
  it('records the direct line only once an address has been named', async () => {
    const onReviseLine = vi.fn();
    renderDelivery(viaWarehouseLine(), onReviseLine);

    await userEvent.click(
      await screen.findByRole('radio', { name: 'Direct to customer' }),
    );

    expect(onReviseLine).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /customer/iu }),
      ).toBeInTheDocument(),
    );
  });
});
