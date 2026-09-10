import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { PackagingTypesController } from 'purchase-drafts/rest/controllers/packaging-types.controller.js';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator.js';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { describe, expect, it } from 'vitest';

// T16 §What — "Serve the Packaging Type catalogue at `/packaging-types` so no literal segment
// competes with a `{purchaseDraftId}` parameter" (openapi.yaml `listPackagingTypes`, sad.md §7).
// A distinct URL prefix from `/purchase-drafts` gets its own controller, mirroring how `/demand`
// is `DemandController` beside `CustomerOrdersController` in the `customer-orders` module (T11).
//
// `PackagingTypesController` does not exist yet, so this import fails to resolve (GOOD red).
const method = (name: keyof PackagingTypesController): object =>
  Object.getOwnPropertyDescriptor(PackagingTypesController.prototype, name)
    ?.value as object;

describe('PackagingTypesController', () => {
  it('mounts at /packaging-types under the named Warehouse, not nested under /purchase-drafts', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PackagingTypesController)).toBe(
      'api/v1/warehouses/:warehouseId/packaging-types',
    );
  });

  it('serves the catalogue read as GET /', () => {
    expect(
      Reflect.getMetadata(METHOD_METADATA, method('listPackagingTypes')),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(PATH_METADATA, method('listPackagingTypes')),
    ).toBe('/');
  });

  // AC-13/sad.md §7 — the catalogue read requires `PURCHASE_DRAFTS:WATCH`, the same Permission
  // every other Purchase Draft read requires.
  it('declares PURCHASE_DRAFTS:WATCH and the two access guards, no rate limit', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        method('listPackagingTypes'),
      ),
    ).toEqual([PermissionId.PURCHASE_DRAFTS_WATCH]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, method('listPackagingTypes')),
    ).toEqual([SessionAuthGuard, WarehouseAccessGuard]);
  });

  // AC-23 — the catalogue read is archived-tolerant.
  it('is archived-tolerant (AC-23)', () => {
    expect(
      Reflect.getMetadata(READ_TOLERANT_KEY, method('listPackagingTypes')),
    ).toBe(true);
  });
});
