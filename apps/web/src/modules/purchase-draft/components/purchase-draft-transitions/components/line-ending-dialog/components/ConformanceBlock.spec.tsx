import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { ConformanceBlock } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/ConformanceBlock';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { PackagingType } from '@warehouser/contracts/purchase-drafts';
import type { ConformanceBlockForm } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/ConformanceBlock';
import type { ReactElement } from 'react';

// T16 — design-handoff.md `W6TARi` cells `upEnS`/`lBacq`/`B00NU` (mobile
// `LZx6B`): the frozen-instruction read-out, then a real `radiogroup` of
// Met / Not met / Not applicable with **no default selection**, then the note
// field shown only under Not met. AC-15, AC-15a, AC-17, AC-17a.
//
// The option a line cannot take is dimmed-and-unavailable with
// `aria-disabled`, and the reason it cannot be taken is exposed **once for
// the group** — not repeated per option (design-handoff.md §Accessibility) —
// which is why every "withheld option" case below asserts the explanatory
// text's *count*, not merely its presence: a component that printed the
// sentence beside every option would still pass a bare `getByText`.

const Harness = ({
  packagingTypeId = 'cartons',
  valueAddingNote = null,
}: {
  packagingTypeId?: string | null;
  valueAddingNote?: string | null;
}): ReactElement => {
  const form = useForm<ConformanceBlockForm>({
    defaultValues: { preReceiptConformance: { note: '', verdict: '' } },
  });
  return (
    <ConformanceBlock
      form={form}
      packagingTypeId={packagingTypeId}
      valueAddingNote={valueAddingNote}
    />
  );
};

// T16 (2026-09-08 review) — this block reads a warehouse-scoped catalogue
// (`usePackagingTypes`) to resolve the frozen Packaging Type to its label, so
// it is mounted the same way `ConditionBlock.spec.tsx` mounts its own
// warehouse-scoped read: as a descendant of an **entered** Warehouse match,
// never a bare store. `renderWithProviders` under-described this component's
// real dependency and crashed `usePackagingTypes` outside any router context.
/**
 * Mounts the block with the Packaging Type catalogue seeded into the cache its
 * own `usePackagingTypes()` subscribes to, rather than handed over as a prop.
 * The production read is then the only shape under test — a catalogue prop no
 * production caller passed left the live-query arm asserted by nothing
 * (2026-09-08 review).
 */
const renderWithCatalogue = (
  catalogue: PackagingType[],
  props: {
    packagingTypeId?: string | null;
    valueAddingNote?: string | null;
  } = {},
): void => {
  const store = authenticatedStore();
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPackagingTypes',
      accessIds.warehouse,
      catalogue,
    ),
  );
  renderInEnteredWarehouse(<Harness {...props} />, store, accessIds.warehouse);
};

const renderInstructed = (): void => {
  renderInEnteredWarehouse(<Harness />);
};

const renderUninstructed = (): void => {
  renderInEnteredWarehouse(
    <Harness packagingTypeId={null} valueAddingNote={null} />,
  );
};

/** The router `beforeLoad` this harness renders behind resolves a tick after
 * mount (`ConditionBlock.spec.tsx`'s own pattern), so the first query in every
 * case below awaits the tree it publishes rather than racing an empty first
 * paint. Every `expect` after it reads perfectly synchronously, exactly as it
 * did before the harness swap. */
const radiogroup = (): Promise<HTMLElement> =>
  screen.findByRole('radiogroup', {
    name: /did the supplier follow your instruction\?/iu,
  });

describe('ConformanceBlock', () => {
  // DoD bullet 1 / AC-15, AC-17a — a member must look at the goods before the
  // fastest path through the dock is open to them.
  it('opens with no option selected', async () => {
    renderInstructed();

    const options = within(await radiogroup()).getAllByRole('radio');
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option).not.toBeChecked();
    }
  });

  // design-handoff.md §Accessibility — the group's own name, and each option
  // announcing its own label rather than a shared one.
  it('names the group and each of its three options individually', async () => {
    renderInstructed();

    const group = await radiogroup();
    expect(group).toBeInTheDocument();
    expect(
      within(group).getByRole('radio', { name: /^met$/iu }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('radio', { name: /^not met$/iu }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('radio', { name: /not applicable/iu }),
    ).toBeInTheDocument();
  });

  // AC-17a — a line frozen carrying an instruction can only be judged honoured
  // or not honoured; "not applicable" is not a legal answer for it.
  it('withholds "not applicable" on a line frozen carrying an instruction, aria-disabled, its reason stated once', async () => {
    renderInstructed();

    const group = await radiogroup();
    const notApplicable = within(group).getByRole('radio', {
      name: /not applicable/iu,
    });
    expect(notApplicable).toBeDisabled();
    expect(within(group).getByRole('radio', { name: /^met$/iu })).toBeEnabled();
    expect(
      within(group).getByRole('radio', { name: /^not met$/iu }),
    ).toBeEnabled();
    // Stated once for the whole group, not once per option it cannot take —
    // a component repeating the sentence beside "not applicable" alone would
    // still make this `getAllByText` return exactly one match; the count
    // proves the sentence is not duplicated anywhere else in the block.
    expect(screen.getAllByText(/does not apply/iu)).toHaveLength(1);
  });

  // AC-17 — a line frozen with no instruction can only record that the
  // judgement does not apply; "Met"/"Not met" are not legal answers for it.
  it('withholds "Met" and "Not met" on a line frozen with no instruction, aria-disabled, its reason stated once', async () => {
    renderUninstructed();

    const group = await radiogroup();
    expect(
      within(group).getByRole('radio', { name: /^met$/iu }),
    ).toBeDisabled();
    expect(
      within(group).getByRole('radio', { name: /^not met$/iu }),
    ).toBeDisabled();
    expect(
      within(group).getByRole('radio', { name: /not applicable/iu }),
    ).toBeEnabled();
    expect(screen.getAllByText(/does not apply/iu)).toHaveLength(1);
  });

  // AC-15/AC-15a — the note is where the member names which of the two frozen
  // instructions failed, and it exists only once the verdict that needs one is
  // given: it must not be offered under "Met", where there is nothing to
  // explain, and it must not survive a member picking "Met" after having
  // already typed into it.
  it('shows the note only once "Not met" is chosen, and hides it again under "Met"', async () => {
    const user = userEvent.setup();
    renderInstructed();

    const group = await radiogroup();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: /^met$/iu }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: /^not met$/iu }));
    const note = await screen.findByRole('textbox');
    await user.type(note, 'value-adding note not applied');
    expect(note).toHaveValue('value-adding note not applied');

    await user.click(within(group).getByRole('radio', { name: /^met$/iu }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // AC-15a — one judgement covers both a Packaging Type and a Value-adding
  // Note frozen on the same line: there is exactly one radiogroup, never a
  // second one for the second instruction.
  it('offers one judgement for a line frozen with both a Packaging Type and a Value-adding Note', async () => {
    renderInEnteredWarehouse(
      <Harness
        packagingTypeId="cartons"
        valueAddingNote="Add desiccant packs"
      />,
    );

    await radiogroup();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
  });

  // 2026-09-08 review — the frozen read-out must show the catalogue's own
  // label, never the raw `packagingTypeId`: a member reading "cartons" where
  // the frame draws "Carton, palletized" (`ending-dialogs-desktop-v1.html:356`)
  // cannot judge the goods against the instruction they were actually given.
  // This is the one case that fails loudly if `catalogue.find(...)` matches
  // the wrong field, if the resolved label is never rendered, or if the raw
  // id leaks through beside it — a `find` comparing against `label` instead
  // of `id` would always miss, fall through to the id, and leave every other
  // case in this file green.
  it('resolves the frozen Packaging Type to its catalogue label, never the raw id, from the catalogue it reads itself', async () => {
    renderWithCatalogue([{ id: 'cartons', label: 'Carton, palletized' }], {
      packagingTypeId: 'cartons',
    });

    await radiogroup();
    expect(screen.getByText(/carton, palletized/iu)).toBeInTheDocument();
    expect(screen.queryByText(/^cartons$/iu)).not.toBeInTheDocument();
  });

  // The same resolution, sourced from the live `usePackagingTypes()` query
  // rather than the override prop above — the fallback branch every
  // production caller actually takes (`LineEndingFieldset` hands over no
  // `packagingTypes` of its own).
  it('resolves the frozen Packaging Type to its catalogue label via the live catalogue query, with no override prop', async () => {
    const store = authenticatedStore();
    void store.dispatch(
      purchaseDraftApi.util.upsertQueryData(
        'listPackagingTypes',
        accessIds.warehouse,
        [{ id: 'cartons', label: 'Carton, palletized' }],
      ),
    );

    renderInEnteredWarehouse(<Harness />, store, accessIds.warehouse);

    await radiogroup();
    expect(await screen.findByText(/carton, palletized/iu)).toBeInTheDocument();
    expect(screen.queryByText(/^cartons$/iu)).not.toBeInTheDocument();
  });
});

// 2026-09-08 frontend review: the heading was rendered twice — once as a
// hand-styled <p> and once as the group's aria-label — so the same sentence
// entered the accessibility tree twice and React Aria's own label association
// was bypassed. The heading labels the whole block (the frozen instruction
// panel as well as the verdicts), so it stays where the frame draws it and the
// group points at it, rather than moving inside the group as a <Label> and
// dropping below the panel.
describe('the conformance heading labels the group once', () => {
  it('renders the heading exactly once', async () => {
    renderWithCatalogue([{ id: 'cartons', label: 'Carton, palletized' }]);
    await radiogroup();

    expect(
      screen.getAllByText(/did the supplier follow your instruction/iu),
    ).toHaveLength(1);
  });

  it('labels the radiogroup by that heading rather than by a copy of its text', async () => {
    renderWithCatalogue([{ id: 'cartons', label: 'Carton, palletized' }]);
    const group = await radiogroup();

    expect(group).not.toHaveAttribute('aria-label');

    const labelledBy = group.getAttribute('aria-labelledby');
    expect(labelledBy).not.toBeNull();
    expect(
      document.getElementById(labelledBy ?? '')?.textContent?.toLowerCase(),
    ).toContain('did the supplier follow your instruction');
  });
});
