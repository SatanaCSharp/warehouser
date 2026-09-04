import { describe, expect, it } from 'vitest';

import i18n from 'i18n';
import { MUTATION_FEEDBACK } from 'shared/alerts/mutation-actions';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';

// F12 — `hWFRW`'s "Success · what actually committed" tile requires the success
// copy to state the outcome in the vocabulary of the page: `On-hand set to 60 ·
// Pallet wrap, 500mm`, not "On-hand quantity recorded". The registry is where
// that is decided, so this is where it is pinned, beside the subject
// (`placing-web-tests.md` §1).
//
// The sentence is assembled here exactly as `mutationFeedbackMiddleware`
// assembles it — the same registry entry, the same `i18n` instance, the same
// `success` namespace — so a case that passes here is the sentence a member is
// shown. The middleware's own lifecycle handling is its spec's subject, not
// this one's.
//
// What the registry can see is the settled mutation's **arguments** and nothing
// else: no response body, no cache. Every value below therefore has to arrive
// in the request argument, which is what `api/item-api.ts` and
// `api/customer-order-api.ts` carry the naming fields for.

const successToast = (endpoint: string, originalArgs: unknown): string => {
  const feedback = MUTATION_FEEDBACK[endpoint];
  const action =
    typeof feedback.action === 'function'
      ? feedback.action(originalArgs as never)
      : (feedback.action ?? endpoint);

  return i18n.t(`${feedback.scope}.${action}`, {
    ns: 'success',
    ...feedback.describe?.(originalArgs as never),
  });
};

const grouped = (digits: string): string =>
  digits.replace(' ', QUANTITY_GROUP_SEPARATOR);

describe('MUTATION_FEEDBACK success copy', () => {
  it('states the counted figure and the Item it was counted for (AC-08)', () => {
    expect(
      successToast('adjustItemOnHandQuantity', {
        description: 'Pallet wrap, 500mm',
        input: { countedQuantity: 60, reason: 'Cycle count' },
      }),
    ).toBe('On-hand set to 60 · Pallet wrap, 500mm');
  });

  it('groups the counted figure exactly as every other quantity on the page is', () => {
    expect(
      successToast('adjustItemOnHandQuantity', {
        description: 'Pallet wrap, 500mm',
        input: { countedQuantity: 1200, reason: 'Cycle count' },
      }),
    ).toBe(`On-hand set to ${grouped('1 200')} · Pallet wrap, 500mm`);
  });

  it('names the Item each catalogue write committed against (AC-06, AC-06c, AC-06d)', () => {
    const item = { sku: 'WH-100420', description: 'Pallet wrap, 500mm' };

    expect(successToast('createItem', { input: item })).toBe(
      'Item added · WH-100420 · Pallet wrap, 500mm',
    );
    expect(successToast('updateItem', item)).toBe(
      'Item corrected · WH-100420 · Pallet wrap, 500mm',
    );
    expect(successToast('deactivateItem', item)).toBe(
      'Deactivated · WH-100420 · Pallet wrap, 500mm',
    );
    expect(successToast('reactivateItem', item)).toBe(
      'Reactivated · WH-100420 · Pallet wrap, 500mm',
    );
  });

  it('states the demand that was recorded, for whom and by when (AC-01)', () => {
    expect(
      successToast('recordCustomerOrder', {
        input: {
          itemId: 'ignored',
          customerName: 'Nordwind Logistik GmbH',
          quantity: 1000,
          neededBy: '2026-09-02',
        },
      }),
    ).toBe(
      `Demand recorded · ${grouped('1 000')} for Nordwind Logistik GmbH, needed by 2 Sep 2026`,
    );
  });

  // AC-19 — an amendment carries either value or both, and the toast reports
  // whichever actually committed rather than one sentence covering all three.
  it.each([
    [
      { quantity: 1000 },
      `Order amended · Nordwind Logistik GmbH is now waiting for ${grouped('1 000')}`,
    ],
    [
      { neededBy: '2026-09-02' },
      'Order amended · Nordwind Logistik GmbH now needs it by 2 Sep 2026',
    ],
    [
      { quantity: 1000, neededBy: '2026-09-02' },
      `Order amended · Nordwind Logistik GmbH is now waiting for ${grouped('1 000')} by 2 Sep 2026`,
    ],
  ])(
    'reports the amendment that committed, and only it (%o)',
    (input, copy) => {
      expect(
        successToast('amendCustomerOrder', {
          customerName: 'Nordwind Logistik GmbH',
          input,
        }),
      ).toBe(copy);
    },
  );

  it('states the reason a cancellation was recorded with (AC-19a)', () => {
    expect(
      successToast('cancelCustomerOrder', {
        customerName: 'Baltic Freight OÜ',
        input: { cancellationReason: 'Customer withdrew' },
      }),
    ).toBe('Order cancelled · Baltic Freight OÜ · Customer withdrew');
  });

  // T24/design-handoff.md `LDc7S` — "toasts state what committed, including the consequence a
  // member could not otherwise see". For a per-line ending there are two such consequences, and
  // neither is visible on the draft: that the draft closes only once *every* line has an ending
  // (AC-19), and that a direct delivery moved no stock at all because the goods were never here
  // (AC-21). Pinned as copy rather than as rendering, because the registry is what decides it.
  it('states that an arrival was recorded and that the draft closes only on the last line (AC-19)', () => {
    const copy = successToast('recordPurchaseDraftLineArrival', {});

    expect(copy).toMatch(/arrival is recorded/iu);
    expect(copy).toMatch(/still waiting for has been reduced/iu);
    expect(copy).toMatch(/closes once every line has an ending/iu);
  });

  it('states that a direct delivery moved no stock, because the goods were never here (AC-21)', () => {
    const copy = successToast('recordPurchaseDraftLineDirectDelivery', {});

    expect(copy).toMatch(/delivery is recorded/iu);
    expect(copy).toMatch(/still waiting for has been reduced/iu);
    // The invisible consequence — the whole reason this sentence differs from the arrival's.
    expect(copy).toMatch(/no stock moved/iu);
    expect(copy).toMatch(/never counted here/iu);
  });
});
