import { screen } from '@testing-library/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import { renderWithProviders } from 'test/render';
import { describe, expect, it } from 'vitest';

// delivery-addresses R8 — AC-07 is the load-bearing case this component's own
// docblock names: the refusal has to name the rule **and** state the order the
// member must follow (add the replacement address first, then deactivate the
// old one). Never opened by any prior spec. Every mapped code, plus the
// unmapped fallback, is asserted on its rendered text — a server code is
// never display text (web-error-handling.md §5).

describe('CustomerRefusalAlert', () => {
  it('renders nothing before a refusal arrives', () => {
    renderWithProviders(<CustomerRefusalAlert />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing for a refusal a field already explains', () => {
    renderWithProviders(
      <CustomerRefusalAlert code={ErrorCode.CUSTOMERS_NAME_TAKEN} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-07 — the rule and the order the member must follow, not merely "this
  // is not allowed".
  it("names the AC-07 rule and the order to follow for a Customer's last active address", () => {
    renderWithProviders(
      <CustomerRefusalAlert
        code={ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A customer always keeps at least one active delivery address. Add the replacement address first, then deactivate this one.',
    );
  });

  it('explains an Inactive address cannot be made Main', () => {
    renderWithProviders(
      <CustomerRefusalAlert
        code={ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'An inactive address cannot be the main one. Make it active again first.',
    );
  });

  // AC-12 — one non-enumerating outcome for a missing record, never hinting
  // it exists elsewhere.
  it('states a target is unavailable without hinting it exists elsewhere', () => {
    renderWithProviders(
      <CustomerRefusalAlert code={ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This customer is not available. Nothing has changed.',
    );
  });

  it('states an archived Warehouse accepts no change', () => {
    renderWithProviders(
      <CustomerRefusalAlert code={ErrorCode.ACCESS_WAREHOUSE_ARCHIVED} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This warehouse is archived, so nothing here can be changed. Nothing has changed.',
    );
  });

  it('states a request refused as it stands', () => {
    renderWithProviders(<CustomerRefusalAlert code="request.invalid" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This could not be saved as it stands. Nothing has changed.',
    );
  });

  // The unmapped fallback: a code no lookup entry names still resolves to a
  // real sentence, never a raw code or an empty alert.
  it('falls back to a real sentence for a code no entry names', () => {
    renderWithProviders(
      <CustomerRefusalAlert code="customers.something_new" />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'This could not be saved. Nothing has changed.',
    );
    expect(alert).not.toHaveTextContent('customers.something_new');
  });
});
