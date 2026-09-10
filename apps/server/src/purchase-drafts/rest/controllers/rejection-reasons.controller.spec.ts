import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { RejectionReasonsController } from 'purchase-drafts/rest/controllers/rejection-reasons.controller';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';
import { describe, expect, it } from 'vitest';

// T13 §What/sad.md §7 — the Rejection Reason catalogue, served at its own top-level segment so no
// literal segment competes with a `{purchaseDraftId}` parameter, mirroring `PackagingTypesController`
// (AC-06). Before T13, `RejectionReasonsController` did not exist on this branch, so this import
// failed to resolve and the whole suite reported "Cannot find module" (GOOD red); the metadata
// asserted below is now proven against the shipped controller.
const method = (name: keyof RejectionReasonsController): object =>
  Object.getOwnPropertyDescriptor(RejectionReasonsController.prototype, name)
    ?.value as object;

describe('RejectionReasonsController', () => {
  it('mounts at /rejection-reasons under the named Warehouse, not nested under /purchase-drafts', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RejectionReasonsController)).toBe(
      'api/v1/warehouses/:warehouseId/rejection-reasons',
    );
  });

  it('serves the catalogue read as GET /', () => {
    expect(
      Reflect.getMetadata(METHOD_METADATA, method('listRejectionReasons')),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(PATH_METADATA, method('listRejectionReasons')),
    ).toBe('/');
  });

  // AC-06/sad.md §7 — the catalogue read requires `PURCHASE_DRAFTS:WATCH`, the same Permission a
  // member composing a refusal already holds to open the draft.
  it('declares PURCHASE_DRAFTS:WATCH and the two access guards, no rate limit', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        method('listRejectionReasons'),
      ),
    ).toEqual([PermissionId.PURCHASE_DRAFTS_WATCH]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, method('listRejectionReasons')),
    ).toEqual([SessionAuthGuard, WarehouseAccessGuard]);
    expect(
      Reflect.getMetadata(
        WRITE_RATE_LIMITED_KEY,
        method('listRejectionReasons'),
      ),
    ).toBeUndefined();
  });

  // AC-06/sad.md §6.5 — read under the draft-watching Permission, archived-tolerant, exactly as the
  // Packaging Type catalogue is read.
  it('is archived-tolerant', () => {
    expect(
      Reflect.getMetadata(READ_TOLERANT_KEY, method('listRejectionReasons')),
    ).toBe(true);
  });

  // AC-06/sad.md §6.5 — "Members never write it. There is no mutation handler." Asserted
  // structurally over the controller's own prototype rather than by inspection, so a POST, PATCH,
  // PUT or DELETE handler added here later fails this case rather than only a manual review: every
  // own-property of the prototype besides the constructor must be the one GET handler, decorated
  // with GET and nothing else.
  it('carries no mutation handler at all', () => {
    const ownMembers = Object.getOwnPropertyNames(
      RejectionReasonsController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(ownMembers).toEqual(['listRejectionReasons']);
    for (const name of ownMembers) {
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          method(name as keyof RejectionReasonsController),
        ),
      ).toBe(RequestMethod.GET);
    }
  });
});
