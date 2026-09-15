import { ErrorCode } from '@warehouser/shared-types/enums';
import { itemApi } from 'modules/item/api/item-api';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-09 / AC-09a — `modules/item/api/item-api.ts` had no spec, so every one of its
// `transformErrorResponse` declarations was unmeasured. They are the whole reason the Item dialogs
// can explain a refusal on the field it belongs to: the server names a code, and these tables turn
// it into the validation key the form renders. A refusal that fell through one of them would show a
// member the server's own rule spelling, or no field error at all.
//
// The endpoints are driven end-to-end through the store with a stubbed `fetch`, the way the other
// `*-api.spec.ts` files in this app drive theirs, so what is asserted is the failure a component
// actually receives rather than a private function called directly.

const warehouseId = accessIds.warehouse;
const itemId = '00000000-0000-4000-8000-000000000801';

/** Answers every request with one refusal envelope, shaped as the server sends it. */
const stubRefusal = (body: unknown, status = 422): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(body, { status }))),
  );
};

const adjust = async (): Promise<unknown> => {
  const store = makeStore();
  const result = await store.dispatch(
    itemApi.endpoints.adjustItemOnHandQuantity.initiate({
      warehouseId,
      itemId,
      // The Item's description travels beside the payload: the success toast states the outcome in
      // the page's vocabulary ("On-hand set to 60 · Pallet wrap, 500mm"), so the endpoint is handed
      // what to call the Item as well as what to record about it.
      description: 'Pallet wrap, 500mm',
      input: { countedQuantity: -1, reason: 'recount' },
    }),
  );

  return 'error' in result ? result.error : undefined;
};

describe('itemApi refusal mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The range refusal carries `details: { field, rule }`, so `api-client.ts` has already lifted
  // `{ countedQuantity: 'non_negative_integer' }` out of it. What this endpoint adds is the rename
  // to the key the form translates — no component should have to know the server's spelling.
  it('renames the server rule for a refused counted quantity to its validation key', async () => {
    stubRefusal({
      code: ErrorCode.ITEMS_INVALID_INPUT,
      message: 'Invalid input',
      details: { field: 'countedQuantity', rule: 'non_negative_integer' },
    });

    await expect(adjust()).resolves.toMatchObject({
      fieldErrors: { countedQuantity: 'nonNegativeInteger' },
    });
  });

  // A rule this table has never seen still has to reach the field it belongs to rather than being
  // dropped. It passes through under its own name — which is the deliberate choice here, and the
  // reason the fallback exists at all.
  it('keeps an unrecognised counted-quantity rule on its own field', async () => {
    stubRefusal({
      code: ErrorCode.ITEMS_INVALID_INPUT,
      message: 'Invalid input',
      details: { field: 'countedQuantity', rule: 'a_rule_added_later' },
    });

    await expect(adjust()).resolves.toMatchObject({
      fieldErrors: { countedQuantity: 'a_rule_added_later' },
    });
  });

  // The other half of the adjustment mapping, and the branch that must *not* touch the quantity: a
  // missing reason is a domain refusal whose envelope names no rule, so `api-client.ts` lifts no
  // `fieldErrors` and this endpoint supplies the one it belongs to.
  it('places a missing adjustment reason on the reason field', async () => {
    stubRefusal({
      code: ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED,
      message: 'A reason is required.',
    });

    const failure = (await adjust()) as {
      fieldErrors?: Record<string, string>;
    };

    expect(failure.fieldErrors).toEqual({ reason: 'required' });
  });

  // AC-07 — a SKU already in use is refused as its own code and belongs on the SKU field, which is
  // where the frame draws it. The server names no field for it, so the endpoint does.
  it('places a taken SKU on the SKU field when creating an Item', async () => {
    stubRefusal({
      code: ErrorCode.ITEMS_SKU_TAKEN,
      message: 'That SKU is already used.',
    });
    const store = makeStore();

    const result = await store.dispatch(
      itemApi.endpoints.createItem.initiate({
        warehouseId,
        input: {
          sku: 'WH-100420',
          description: 'Pallet wrap, 500mm',
          unitOfMeasure: 'each',
        },
      }),
    );

    expect('error' in result ? result.error : undefined).toMatchObject({
      fieldErrors: { sku: 'skuTaken' },
    });
  });

  // AC-06c — both refusals a correction can hit are about the SKU, and they explain different
  // things: `skuFixed` names an Item whose SKU may no longer change at all.
  it.each([
    [ErrorCode.ITEMS_SKU_FIXED, 'skuFixed'],
    [ErrorCode.ITEMS_SKU_TAKEN, 'skuTaken'],
  ])(
    'explains %s on the SKU field when correcting an Item',
    async (code, key) => {
      stubRefusal({ code, message: 'Refused.' });
      const store = makeStore();

      const result = await store.dispatch(
        itemApi.endpoints.updateItem.initiate({
          warehouseId,
          itemId,
          sku: 'WH-100420',
          description: 'Pallet wrap, 500mm',
          input: { description: 'Pallet wrap, 500mm' },
        }),
      );

      expect('error' in result ? result.error : undefined).toMatchObject({
        fieldErrors: { sku: key },
      });
    },
  );
});
