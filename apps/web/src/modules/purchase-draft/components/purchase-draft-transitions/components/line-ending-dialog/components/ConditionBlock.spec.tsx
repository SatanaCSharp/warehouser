import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RejectionReason } from '@warehouser/contracts/purchase-drafts';
import { maxProseLength } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import type { ConditionBlockForm } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/ConditionBlock';
import { ConditionBlock } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/ConditionBlock';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';
import { describe, expect, it } from 'vitest';

// T15/design-handoff.md `W6TARi` cell `H0jcSr` (`kejd2` at mobile) — the
// condition block that sits on **every** ending for a line where something was
// received: a head row (micro-label, the Rejection Source chip, the
// `Refuse some of this` control), the refusal editor rows it opens, and the
// condition summary live region.
//
// The one figure this block never lets a member type is the accepted
// quantity: it is presented minus every refused row, derived and announced,
// never an input (AC-01).

const reasons: RejectionReason[] = [
  {
    id: 'damaged_by_packing',
    label: 'Damaged by packing',
    requiresDescription: false,
  },
  {
    id: 'packaging_not_as_instructed',
    label: 'Packaging not as instructed',
    requiresDescription: false,
  },
];

/**
 * `ConditionBlock` is a controlled fragment of the ending form, not a form of
 * its own — exactly like `EndingAssignmentRow`. This harness gives it the
 * `rejections` field array a real `LineEndingDialog` would hand it, so the
 * suite exercises the same `useFieldArray` wiring the shipped fieldset uses.
 *
 * `withSentinel` renders a permission gate behind the very Permission
 * `ConditionBlock`'s own refuse control gates on, mirroring
 * `LineEndingAction.spec.tsx`: a case asserting an absence waits for the
 * sentinel instead of racing an empty first paint.
 */
const Harness = ({
  kind = 'arrival',
  presented = 100,
  withSentinel = false,
}: {
  kind?: 'arrival' | 'directDelivery';
  presented?: number;
  withSentinel?: boolean;
}): ReactElement => {
  const form = useForm<ConditionBlockForm>({
    defaultValues: { rejections: [] },
  });
  return (
    <>
      <ConditionBlock
        form={form}
        itemSku="WH-100420"
        kind={kind}
        ordered={presented}
        presented={presented}
      />
      {withSentinel && (
        // Gated on a Permission the case under test still holds (it withholds
        // only `REJECTIONS:CREATE`), so an absence assertion waits for the
        // permission projection to resolve instead of racing an empty first
        // paint — `LineEndingAction.spec.tsx`'s own sentinel convention.
        <WarehousePermissionGate
          permission={PermissionId.PURCHASE_DRAFTS_RECEIVE}
        >
          <span>gate resolved</span>
        </WarehousePermissionGate>
      )}
    </>
  );
};

const render = (
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
  props: { kind?: 'arrival' | 'directDelivery'; withSentinel?: boolean } = {},
): void => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
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
  // The catalogue is seeded into the cache the component's own
  // `useRejectionReasons()` subscribes to, rather than handed over as a prop:
  // the production read is then the only shape under test (2026-09-08 review —
  // a catalogue prop no production caller passed left the live-query arm
  // asserted by nothing).
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listRejectionReasons',
      accessIds.warehouse,
      reasons,
    ),
  );

  renderInEnteredWarehouse(<Harness {...props} />, store, accessIds.warehouse);
};

const summary = (): Promise<HTMLElement> => screen.findByRole('status');

const refuseButton = (): HTMLElement | null =>
  screen.queryByRole('button', { name: /refuse some of this/iu });

/** The router `beforeLoad` this harness renders behind resolves a tick after
 * mount, so the first assertion in every case waits for the tree it publishes
 * rather than racing an empty first paint. */
const findRefuseButton = (): Promise<HTMLElement> =>
  screen.findByRole('button', { name: /refuse some of this/iu });

describe('ConditionBlock', () => {
  // DoD bullet 1 — never collapsed, no disclosure, no empty state.
  it('opens at presented, 0 refused, presented accepted, with the summary announced live', async () => {
    render();

    const region = await summary();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent(/100\s*presented/iu);
    expect(region).toHaveTextContent(/0\s*refused/iu);
    expect(region).toHaveTextContent(/100\s*accepted/iu);
  });

  // AC-24 — the source is derived from the line's own Delivery Mode and is
  // never itself a field, so the wrong value cannot be expressed.
  it.each<['arrival' | 'directDelivery', RegExp]>([
    ['arrival', /inspected at your dock/iu],
    ['directDelivery', /reported by the customer/iu],
  ])(
    'renders the %s source as a chip, never as an editable control',
    async (kind, wording) => {
      render(Object.values(PermissionId), { kind });

      const chip = await screen.findByText(wording);
      expect(chip.closest('[data-slot="chip"]')).not.toBeNull();
      // Never a field: nothing named after the source is a combobox or textbox.
      expect(
        screen.queryByRole('combobox', { name: /source/iu }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: /source/iu }),
      ).not.toBeInTheDocument();
    },
  );

  // review-2026-09-09, finding 6 — AC-14 blocks correctly at three layers but
  // never told the member the bound. `proseSchema` refuses 1001 characters at
  // the validation pipe as `request.invalid`, a code `EndingRefusalAlert` does
  // not map, so the domain's `description_too_long` sentence and its
  // `{{maxLength}}` were unreachable and the member got the generic "unknown"
  // refusal. Bounding the control is what makes the server refusal never the
  // member's first notice.
  it('bounds the refusal description at the stored maximum and names it (AC-14)', async () => {
    const user = userEvent.setup();
    render(Object.values(PermissionId));

    await user.click(await findRefuseButton());

    const description = await screen.findByRole('textbox', {
      name: /describe what was wrong/iu,
    });
    expect(description).toHaveAttribute('maxLength', String(maxProseLength));
    expect(
      await screen.findByText(/up to 1\s?000 characters/iu),
    ).toBeInTheDocument();
  });

  // AC-01a — absent, not disabled, and nothing else in the render hints that a
  // refusal capability exists for this member.
  it('withholds the refuse control from a member without REJECTIONS:CREATE, hinting nothing', async () => {
    render(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.REJECTIONS_CREATE,
      ),
      { withSentinel: true },
    );

    await screen.findByText('gate resolved');

    expect(refuseButton()).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /refuse/iu }),
    ).not.toBeInTheDocument();
    // AC-01b — an ending that refuses nothing still records: the block is
    // present and the summary still reads presented-equals-accepted.
    const region = await summary();
    expect(region).toHaveTextContent(/100\s*presented/iu);
    expect(region).toHaveTextContent(/100\s*accepted/iu);
  });

  it('offers the refuse control neutrally — never destructive-styled — for a member who holds it', async () => {
    render();

    const button = await findRefuseButton();
    expect(button.className).not.toMatch(/danger/iu);
  });

  // AC-05/AC-08 — several refusals, each with its own quantity, reason and
  // description, and the accepted figure derives live as they change.
  it('composes two refusals of different reasons and derives the accepted figure live', async () => {
    const user = userEvent.setup();
    render();

    await user.click(await findRefuseButton());
    await user.click(refuseButton() as HTMLElement);

    const quantities = screen.getAllByRole('spinbutton', {
      name: /quantity refused/iu,
    });
    expect(quantities).toHaveLength(2);
    const reasonTriggers = screen.getAllByRole('button', { name: /reason/iu });

    await user.type(quantities[0], '5');
    await selectHeroOption(user, reasonTriggers[0], 'Damaged by packing');

    await user.type(quantities[1], '3');
    await selectHeroOption(
      user,
      reasonTriggers[1],
      'Packaging not as instructed',
    );

    const region = await summary();
    expect(region).toHaveTextContent(/8\s*refused/iu);
    expect(region).toHaveTextContent(/92\s*accepted/iu);
  });

  // The accepted figure is derived and must never itself be an input.
  it('never renders the accepted figure as something a member can type into', async () => {
    const user = userEvent.setup();
    render();

    await user.click(await findRefuseButton());

    expect(
      screen.queryByRole('spinbutton', { name: /accepted/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /accepted/iu }),
    ).not.toBeInTheDocument();
  });

  // AC-13 — a member's own prose is shown as text, never linkified or run as
  // markup: typing something that looks like a link produces no link role.
  it('renders a typed description as plain text, never as markup or a link', async () => {
    const user = userEvent.setup();
    render();

    await user.click(await findRefuseButton());
    const description = screen.getByRole('textbox', {
      name: /describe what was wrong/iu,
    });
    await user.type(description, 'see https://example.test/report for photos');

    expect(description).toHaveValue(
      'see https://example.test/report for photos',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // The remove control names its subject rather than just "Remove".
  it("names the removed refusal's quantity and reason in the remove control", async () => {
    const user = userEvent.setup();
    render();

    await user.click(await findRefuseButton());
    await user.type(
      screen.getByRole('spinbutton', { name: /quantity refused/iu }),
      '5',
    );
    await selectHeroOption(
      user,
      screen.getByRole('button', { name: /reason/iu }),
      'Damaged by packing',
    );

    expect(
      screen.getByRole('button', {
        name: /remove the refusal of 5 damaged by packing/iu,
      }),
    ).toBeInTheDocument();
  });
});
