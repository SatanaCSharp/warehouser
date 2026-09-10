import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { DemandController } from 'customer-orders/rest/controllers/demand.controller';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';
import { describe, expect, it, vi } from 'vitest';

// T11 — the transport-adapter metadata of the consolidated demand read, in the reflection idiom
// `items.controller.spec.ts` established. The demand read gets its own controller because its path
// is `/demand`, not a sub-resource of `/customer-orders`; the URL and the owning module are allowed
// to disagree, and this one is owned by `customer-orders` because a Demand Line is derived from
// Customer Orders (ADR 18-08-2026, which retains that rule from the superseded ADR 14-08-2026;
// openapi.yaml `/api/v1/warehouses/{warehouseId}/demand`).
const method = (name: keyof DemandController): object =>
  Object.getOwnPropertyDescriptor(DemandController.prototype, name)
    ?.value as object;

describe('DemandController', () => {
  it('mounts the consolidated demand under the named Warehouse', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DemandController)).toBe(
      'api/v1/warehouses/:warehouseId/demand',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, method('readConsolidatedDemand')),
    ).toBe(RequestMethod.GET);
  });

  // AC-05 — the read is authorized by exactly `CUSTOMER_ORDERS:WATCH` and nothing else. One
  // Permission per handler is what keeps a member's denial a denial of that capability alone.
  it('declares exactly CUSTOMER_ORDERS:WATCH and both access guards (AC-05)', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        method('readConsolidatedDemand'),
      ),
    ).toEqual([PermissionId.CUSTOMER_ORDERS_WATCH]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, method('readConsolidatedDemand')),
    ).toEqual([SessionAuthGuard, WarehouseAccessGuard]);
  });

  // T13/AC-09a — the demand read declares `CUSTOMERS:WATCH` **observed**. Under the aggregation
  // shape this feature leaves unchanged it has no field to redact (api-sync-report.md Finding 1,
  // resolved (a)); the declaration exists so sad.md §8's authorization-coverage check has no
  // exception to carve out for a read on the identity-bearing demand surface, and so that adding an
  // identity field to `DemandLine` later cannot silently skip the Permission that governs it.
  //
  // Asserted as its own metadata key: an observed Permission that ended up under
  // `REQUIRED_PERMISSION_KEY` would **deny** AC-09a's member the demand they legitimately read,
  // which is the one mistake this pair of decorators exists to make impossible.
  it('declares CUSTOMERS:WATCH observed, on its own metadata key (AC-09a, ADR 0001)', () => {
    expect(
      Reflect.getMetadata(
        OBSERVED_PERMISSION_KEY,
        method('readConsolidatedDemand'),
      ),
    ).toEqual([PermissionId.CUSTOMERS_WATCH]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        method('readConsolidatedDemand'),
      ),
    ).not.toContain(PermissionId.CUSTOMERS_WATCH);
  });

  // AC-09a/spec.md §6.1 — the Demand Line projection carries no customer identity **at all**, which
  // is why nothing here is redacted. Asserted over the serialized response of a controller whose
  // query has handed it a line carrying identity it must not pass on: the adapter names the nine
  // fields of openapi.yaml `DemandLine` explicitly, so a widened read cannot reach the wire through
  // it. The one count it does carry is not a customer count — it says how many Customer Orders exist
  // for one Item, never how many Customers the Warehouse holds (openapi.yaml `DemandLine`).
  it('passes no customer name, address, access note or customer count onto the demand response (AC-09a)', async () => {
    const leakyLine = {
      itemId: '00000000-0000-4000-8000-000000000101',
      sku: 'TEST-SKU-0001',
      description: 'Test Item - 2 m cable',
      unitOfMeasure: 'metres',
      totalOutstandingQuantity: 65,
      earliestNeededBy: '2026-09-20',
      onHandQuantity: 12,
      unfulfilledCustomerOrderCount: 2,
      coverage: [],
      customerName: 'Test Customer North',
      addressText: 'Test Address 1, Test City',
      accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
      customerCount: 3,
    };
    const controller = new DemandController({
      execute: vi.fn().mockResolvedValue([leakyLine]),
    } as never);

    const response = await controller.readConsolidatedDemand({
      access: {
        warehouseId: '00000000-0000-4000-8000-000000000001',
        observedPermissionIds: [],
      },
    } as never);
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('Test Customer North');
    expect(serialized).not.toContain('Test Address 1, Test City');
    expect(serialized).not.toContain('Gate code on the intercom');
    expect(Object.keys(response[0])).toEqual([
      'itemId',
      'sku',
      'description',
      'unitOfMeasure',
      'totalOutstandingQuantity',
      'earliestNeededBy',
      'onHandQuantity',
      'unfulfilledCustomerOrderCount',
      'coverage',
    ]);
  });

  // AC-23 — a watch Permission keeps authorizing the read after the Warehouse is archived.
  it('tolerates an archived Warehouse and declares no write rate limit (AC-23)', () => {
    expect(
      Reflect.getMetadata(READ_TOLERANT_KEY, method('readConsolidatedDemand')),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        WRITE_RATE_LIMITED_KEY,
        method('readConsolidatedDemand'),
      ),
    ).toBeUndefined();
  });
});
