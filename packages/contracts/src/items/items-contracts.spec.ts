import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  itemLatestAdjustmentSchema,
  itemSchema,
  onHandAdjustmentSchema,
} from 'items';
import { describe, expect, it } from 'vitest';

// The shared `items` contract subpath (contracts/openapi.yaml `Item`, `ItemLatestAdjustment`,
// `OnHandAdjustment`). Mirrors `customer-orders-contracts.spec.ts`: schemas are imported through
// the module barrel by its bare specifier and exercised as behaviour — what they accept and what
// they refuse — never by inspecting their internals.
//
// The load-bearing statement of this file is that the `Item` projection carries the three facts the
// Items table renders and cannot render without: what names the Item (AC-06c, the SKU-correctable
// affordance) and who recorded the latest on-hand count (AC-08, the `by you` attribution).

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const validLatestAdjustment = {
  countedQuantity: 12,
  reason: 'Counted after the cancelled collection',
  adjustedByUserId: id(1),
  adjustedAt: '2026-08-24T10:15:00.000Z',
};

const validItem = {
  id: id(101),
  sku: 'TEST-SKU-0001',
  description: 'Test Item — 2 m cable',
  unitOfMeasure: 'metres',
  onHandQuantity: 12,
  deactivatedAt: null,
  namingCustomerOrderCount: 3,
  namingPurchaseDraftLineCount: 1,
  latestAdjustment: validLatestAdjustment,
  createdAt: '2026-08-01T08:00:00.000Z',
};

describe('items contracts', () => {
  describe('the module is exposed as a package subpath', () => {
    // adding-and-using-contracts.md §3 — consumers import `@warehouser/contracts/items`; there is
    // no root export, so an unexposed module is unreachable from both applications.
    it('declares ./items in the contract package exports', () => {
      const packageJson = JSON.parse(
        readFileSync(
          join(import.meta.dirname, '..', '..', 'package.json'),
          'utf8',
        ),
      ) as { exports: Record<string, unknown> };

      expect(packageJson.exports['./items']).toEqual({
        types: './dist/items/index.d.ts',
        default: './dist/items/index.js',
      });
    });
  });

  describe('Item (openapi.yaml `Item`) — AC-06, AC-06c, AC-06d, AC-08', () => {
    it('accepts the Item the API returns and refuses an unknown field', () => {
      expect(itemSchema.parse(validItem)).toEqual(validItem);
      expect(
        itemSchema.safeParse({ ...validItem, warehouseId: id(501) }).success,
      ).toBe(false);
    });

    // AC-06c — "an Item nothing yet names may still have its SKU corrected". Both counts at zero is
    // the whole of that condition, which is why they are required rather than optional: an absent
    // count would leave a reader unable to tell "nothing names it" from "not stated".
    it('states what names the Item, so a reader can tell whether its SKU is still correctable (AC-06c)', () => {
      expect(
        itemSchema.parse({
          ...validItem,
          namingCustomerOrderCount: 0,
          namingPurchaseDraftLineCount: 0,
        }),
      ).toMatchObject({
        namingCustomerOrderCount: 0,
        namingPurchaseDraftLineCount: 0,
      });

      const { namingCustomerOrderCount, ...withoutOrderCount } = validItem;
      const { namingPurchaseDraftLineCount, ...withoutLineCount } = validItem;

      expect(namingCustomerOrderCount).toBe(3);
      expect(namingPurchaseDraftLineCount).toBe(1);
      expect(itemSchema.safeParse(withoutOrderCount).success).toBe(false);
      expect(itemSchema.safeParse(withoutLineCount).success).toBe(false);
    });

    it('refuses a naming count that is negative or not whole', () => {
      expect(
        itemSchema.safeParse({ ...validItem, namingCustomerOrderCount: -1 })
          .success,
      ).toBe(false);
      expect(
        itemSchema.safeParse({
          ...validItem,
          namingPurchaseDraftLineCount: 1.5,
        }).success,
      ).toBe(false);
    });

    it('carries no latest adjustment until the Item has been counted (AC-08)', () => {
      expect(
        itemSchema.parse({ ...validItem, latestAdjustment: null })
          .latestAdjustment,
      ).toBeNull();
    });
  });

  // AC-08 — "records that count as the Item's On-hand Quantity, together with the reason, the
  // acting member, and the time". The projection carries all three or the criterion is only
  // two-thirds readable: the Items table states them on one line (`24 Aug · cycle count · by you`).
  describe('ItemLatestAdjustment (openapi.yaml `ItemLatestAdjustment`) — AC-08', () => {
    it('carries the figure, the reason, the acting member and the time', () => {
      expect(itemLatestAdjustmentSchema.parse(validLatestAdjustment)).toEqual(
        validLatestAdjustment,
      );
    });

    it('refuses an adjustment that names no acting member', () => {
      const { adjustedByUserId, ...withoutMember } = validLatestAdjustment;

      expect(adjustedByUserId).toBe(id(1));
      expect(itemLatestAdjustmentSchema.safeParse(withoutMember).success).toBe(
        false,
      );
      expect(
        itemLatestAdjustmentSchema.safeParse({
          ...withoutMember,
          adjustedByUserId: 'someone',
        }).success,
      ).toBe(false);
    });

    // The acting member is an id, never a name: this release models no person name at all, so
    // nothing here may carry one (BRIEF §Attribution, `users` has no name column).
    it('refuses a display name smuggled in beside the member id', () => {
      expect(
        itemLatestAdjustmentSchema.safeParse({
          ...validLatestAdjustment,
          adjustedByName: 'Iryna Kovalenko',
        }).success,
      ).toBe(false);
    });

    // The write path already discloses exactly this id, so projecting it onto the Item reveals
    // nothing the same member could not already read back from their own adjustment.
    it('names the acting member with the same field the write path returns', () => {
      expect(
        onHandAdjustmentSchema.parse({
          id: id(110),
          itemId: id(101),
          countedQuantity: 12,
          reason: 'Counted after the cancelled collection',
          adjustedByUserId: id(1),
          createdAt: '2026-08-25T09:45:00.000Z',
        }).adjustedByUserId,
      ).toBe(validLatestAdjustment.adjustedByUserId);
    });
  });
});
