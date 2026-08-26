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
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';

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
