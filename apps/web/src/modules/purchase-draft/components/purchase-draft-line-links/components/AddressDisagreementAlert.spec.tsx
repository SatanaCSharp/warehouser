import { render, screen } from '@testing-library/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { AddressDisagreementAlert } from 'modules/purchase-draft/components/purchase-draft-line-links/components/AddressDisagreementAlert';
import { describe, expect, it } from 'vitest';

// AC-15 / design-handoff.md `IcUGb` — the refusal is drawn as a titled panel:
// the title names the rule ("this line ships to one address, and that order
// goes to another") and the body names the two addresses. Its sibling
// `PurchaseDraftLineDeliveryRefusalAlert` explains the same rule the same way,
// and an alert that carries only a body reads as a different kind of message
// from the one beside it.

const LINE_ADDRESS = 'Hafenstraße 14, 20457 Hamburg';
const ORDER_ADDRESS = 'Werftweg 2, 27568 Bremerhaven';

describe('AddressDisagreementAlert', () => {
  it('names the rule in a title and the two addresses in the body', () => {
    render(
      <AddressDisagreementAlert
        code={ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT}
        lineDeliveryAddressText={LINE_ADDRESS}
        orderDeliveryAddressText={ORDER_ADDRESS}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'This line ships to one address, and that order goes to another',
    );
    expect(alert).toHaveTextContent(LINE_ADDRESS);
    expect(alert).toHaveTextContent(ORDER_ADDRESS);
  });

  it('says nothing at all until the boundary has refused the link', () => {
    render(
      <AddressDisagreementAlert
        lineDeliveryAddressText={LINE_ADDRESS}
        orderDeliveryAddressText={ORDER_ADDRESS}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-11a — an order recorded by typed name goes to no Delivery Address at all, so there is no
  // second address to name. The copy switches to its own `noOrderAddress` variant rather than
  // interpolating a blank, which would read as "the order is going to  instead".
  it('says the picked order names no address when it is recorded by typed name', () => {
    render(
      <AddressDisagreementAlert
        code={ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT}
        lineDeliveryAddressText={LINE_ADDRESS}
        orderDeliveryAddressText={null}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'The order you picked names no delivery address at all',
    );
    expect(alert).toHaveTextContent(LINE_ADDRESS);
  });

  // The other half of the same absence: a line whose own address is not readable — a redacted
  // projection carries none. The alert still states the rule rather than rendering the literal
  // "null" an uncoerced value would produce.
  it('states the rule without an address when the line carries none', () => {
    render(
      <AddressDisagreementAlert
        code={ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT}
        lineDeliveryAddressText={null}
        orderDeliveryAddressText={ORDER_ADDRESS}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'This line ships to one address, and that order goes to another',
    );
    expect(alert).toHaveTextContent(ORDER_ADDRESS);
    expect(alert).not.toHaveTextContent('null');
  });
});
