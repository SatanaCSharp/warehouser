import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it } from 'vitest';

import { customerApi } from 'modules/customer/api/customer-api';
import { CustomerDirectory } from 'modules/customer/components/customer-directory/CustomerDirectory';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Customer, CustomerDetail } from '@warehouser/contracts/customers';
import type { AppStore } from 'store';

// delivery-addresses T21 — the Customers destination's list owner, composing
// `Delivery/Customer Card` (`r80F1`), `Delivery/Address Row` (`LdZmY`),
// `Delivery/Awaiting Row` (`zw3n9`) and `Delivery/Awaiting Card Mobile`
// (`XXFuv`) from the approved frames `KRDln` (1440) and `b7gaH9` (390).
// Colocated with the component it covers (`placing-web-tests.md` §1),
// mirroring `modules/item/.../ItemDirectory.spec.tsx`.
//
// **The load-bearing case in this file is `renders the address and the access
// notes as text`.** spec.md §6.1 classifies an address and its access notes as
// confidential text a member types and the system never interprets; rendering
// either through markup, or turning either into a link, is a security defect
// rather than a styling choice. It is asserted here rather than assumed from
// React's default escaping, because the defect it guards against is a future
// `dangerouslySetInnerHTML` or auto-linking pass, not today's JSX.

const ids = {
  north: '00000000-0000-4000-8000-000000000201',
  south: '00000000-0000-4000-8000-000000000202',
  hafen: '00000000-0000-4000-8000-000000000301',
  dock: '00000000-0000-4000-8000-000000000302',
  order: '00000000-0000-4000-8000-000000000601',
  item: '00000000-0000-4000-8000-000000000101',
} as const;

/**
 * The address text a member typed, carrying markup a naive renderer would
 * execute, and the access notes carrying an anchor a naive one would follow.
 * Both are ordinary text as far as this application is concerned.
 */
const hostileAddressText =
  '<img src=x onerror="alert(1)">Hafenstraße 14, 20457 Hamburg';
const hostileAccessNotes =
  'Gate code 4711 — <a href="https://evil.test">click here</a>';

const hafen = {
  id: ids.hafen,
  customerId: ids.north,
  addressText: hostileAddressText,
  accessNotes: hostileAccessNotes,
  isMain: true,
  deactivatedAt: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const dock = {
  id: ids.dock,
  customerId: ids.north,
  addressText: 'Dockweg 3, 20457 Hamburg',
  accessNotes: null,
  isMain: false,
  deactivatedAt: '2026-09-02T12:00:00.000Z',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z',
};

const north: Customer = {
  id: ids.north,
  name: 'Nordwind Logistik GmbH',
  deactivatedAt: null,
  mainDeliveryAddressId: ids.hafen,
  deliveryAddresses: [hafen, dock],
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const south: Customer = {
  id: ids.south,
  name: 'Südsee Handel AG',
  deactivatedAt: '2026-09-03T08:00:00.000Z',
  mainDeliveryAddressId: null,
  deliveryAddresses: [],
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-03T08:00:00.000Z',
};

const northDetail: CustomerDetail = {
  ...north,
  awaitingCustomerOrders: [
    {
      customerOrderId: ids.order,
      itemId: ids.item,
      itemSku: 'WH-100420',
      itemDescription: 'Pallet wrap, 500mm',
      unitOfMeasure: 'each',
      outstandingQuantity: 40,
      neededBy: '2026-09-20',
      destination: {
        deliveryAddressId: ids.hafen,
        addressText: hostileAddressText,
        accessNotes: hostileAccessNotes,
        isMain: true,
        deactivatedAt: null,
      },
    },
  ],
};

const renderDirectory = ({
  customers = [north, south],
  detail = northDetail,
  permissionIds = Object.values(PermissionId),
}: {
  customers?: Customer[];
  detail?: CustomerDetail;
  permissionIds?: readonly PermissionId[];
} = {}): AppStore => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();

  void store.dispatch(
    customerApi.util.upsertQueryData(
      'listCustomers',
      accessIds.warehouse,
      customers,
    ),
  );
  void store.dispatch(
    customerApi.util.upsertQueryData(
      'readCustomer',
      { warehouseId: accessIds.warehouse, customerId: detail.id },
      detail,
    ),
  );
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

  renderInEnteredWarehouse(<CustomerDirectory />, store, accessIds.warehouse);
  return store;
};

/**
 * Opens the customer whose card carries `name`. The pattern is anchored so it
 * cannot also match that card's kebab, whose accessible name is
 * `Actions for <name>`.
 */
const openCustomer = async (name: RegExp): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name }));
};

describe('CustomerDirectory (frames KRDln, b7gaH9)', () => {
  // AC-01 — a recorded Customer is selectable and readable; the list is the
  // active Customers of the entered Warehouse.
  it('lists the active Customers of the entered Warehouse', async () => {
    renderDirectory();

    expect(
      await screen.findByRole('button', { name: /^Nordwind Logistik GmbH/u }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Südsee Handel AG/u }),
    ).not.toBeInTheDocument();
  });

  // AC-06 — an Inactive Customer stays readable, on its own tab, rather than
  // disappearing from the destination.
  it('shows the Inactive Customers on the Inactive tab', async () => {
    renderDirectory();

    await userEvent.click(await screen.findByRole('tab', { name: 'Inactive' }));

    expect(
      await screen.findByRole('button', { name: /^Südsee Handel AG/u }),
    ).toBeInTheDocument();
  });

  // AC-04, AC-05 — exactly one active address is Main, and the address book
  // says which.
  it('shows the opened Customer address book with its Main and Inactive chips', async () => {
    renderDirectory();
    await openCustomer(/^Nordwind Logistik GmbH/u);

    const addresses = await screen.findByRole('list', {
      name: /Delivery addresses/u,
    });
    const rows = within(addresses).getAllByRole('listitem');

    expect(within(rows[0]).getByText('Main')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Inactive')).toBeInTheDocument();
  });

  // spec.md §6.1 — the security property. The address and the access notes are
  // text a member typed; they are never markup and never a link.
  it('renders the address and the access notes as text, never as markup and never as a link', async () => {
    renderDirectory();
    await openCustomer(/^Nordwind Logistik GmbH/u);

    const addresses = await screen.findByRole('list', {
      name: /Delivery addresses/u,
    });

    const addressText = within(addresses).getByText(hostileAddressText);
    const accessNotes = within(addresses).getByText(hostileAccessNotes);

    // Rendered as text: the element carrying each value has no element child
    // at all, so nothing in it was parsed as markup and nothing was turned
    // into a link. This is asserted on the element's own children rather than
    // on `innerHTML`, because the row's kebab legitimately carries the same
    // string inside an `aria-label` — an attribute value, which is inert, and
    // which a substring check over serialized HTML cannot tell apart from a
    // real element.
    expect(addressText.childElementCount).toBe(0);
    expect(accessNotes.childElementCount).toBe(0);
    expect(addressText.textContent).toBe(hostileAddressText);
    expect(accessNotes.textContent).toBe(hostileAccessNotes);

    // And never as a link or an embedded resource, anywhere in the address
    // book: the address is text this system never interprets (spec.md §6.1).
    expect(addresses.querySelector('img')).toBeNull();
    expect(addresses.querySelector('a')).toBeNull();
    expect(addresses.querySelector('script')).toBeNull();
  });

  // AC-08 — every Unfulfilled Customer Order with its Item, what is still
  // owed, when it is needed by and where it is going, plus why it is going
  // there (`zw3n9` "Going to").
  it('shows what the Customer is waiting for with the destination and why it is that address', async () => {
    renderDirectory();
    await openCustomer(/^Nordwind Logistik GmbH/u);

    const awaiting = await screen.findByRole('grid', {
      name: /waiting for/u,
    });
    const row = within(awaiting).getAllByRole('row')[1];

    expect(within(row).getByText(/Pallet wrap, 500mm/u)).toBeInTheDocument();
    expect(row.textContent).toContain('40');
    expect(within(row).getByText(hostileAddressText)).toBeInTheDocument();
    expect(
      within(row).getByText("The customer's main delivery address"),
    ).toBeInTheDocument();
  });

  // AC-08 — a Customer waiting for nothing says so rather than drawing an
  // empty table.
  it('says the Customer is waiting for nothing when it awaits none', async () => {
    renderDirectory({ detail: { ...northDetail, awaitingCustomerOrders: [] } });
    await openCustomer(/^Nordwind Logistik GmbH/u);

    expect(
      await screen.findByText(/is waiting for nothing/u),
    ).toBeInTheDocument();
  });

  // design-handoff.md §Component mapping — deactivating validates nothing, so
  // it takes the alert dialog rather than the form dialog.
  it('confirms deactivating a Delivery Address through an alert dialog with no form', async () => {
    renderDirectory();
    await openCustomer(/^Nordwind Logistik GmbH/u);

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Actions for ${hostileAddressText}`,
      }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Deactivate address' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.querySelector('form')).toBeNull();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  });

  // heroui-design-principles.md §2 — a `<button>` admits phrasing content
  // only, so the card's heading wraps the control rather than the control
  // wrapping the heading. The pressable region is therefore named by the
  // Customer alone, and no heading is swept into its accessible name.
  it('names a card control by its Customer alone and nests no heading inside it', async () => {
    renderDirectory();

    const control = await screen.findByRole('button', {
      name: 'Nordwind Logistik GmbH',
    });

    expect(within(control).queryByRole('heading')).not.toBeInTheDocument();
  });

  // AC-09 / declarative-permission-gates — a control the actor may not use is
  // absent, never disabled.
  it('offers no Record customer trigger without CUSTOMERS:CREATE', async () => {
    renderDirectory({
      permissionIds: Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.CUSTOMERS_CREATE,
      ),
    });

    await screen.findByRole('button', { name: /^Nordwind Logistik GmbH/u });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Record customer' }),
      ).not.toBeInTheDocument();
    });
  });

  // AC-06a — an Inactive address is never offered where an address is chosen,
  // so the address book's own kebab offers reactivation instead.
  it('offers reactivation rather than deactivation on an Inactive address', async () => {
    renderDirectory();
    await openCustomer(/^Nordwind Logistik GmbH/u);

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Actions for ${dock.addressText}`,
      }),
    );

    expect(
      await screen.findByRole('menuitem', { name: 'Reactivate address' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate address' }),
    ).not.toBeInTheDocument();
  });
});
