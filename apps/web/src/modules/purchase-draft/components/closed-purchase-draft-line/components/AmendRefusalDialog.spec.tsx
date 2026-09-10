import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  PurchaseDraftLineRejection,
  RejectionAmend,
} from '@warehouser/contracts/purchase-drafts';
import { AmendRefusalDialog } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/AmendRefusalDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// T18 — `Modal · Amend this refusal` (`iNstk`, design-handoff.md § Component
// mapping, `W6TARi` cell `Ue4xn`): the dialog a member holding
// `REJECTIONS:UPDATE` opens from the closed-line read row's kebab (T17's
// `PurchaseDraftLineRefusalRow`). It validates a description and a
// Disposition, so it is `FormModalDialog`, never `ConfirmAlertDialog`
// (web-dialogs.md §1). Covers AC-18, AC-18a, AC-18b (belongs to T11's write
// path; this pins the surface half) and AC-19.
//
// Tested directly, exactly as `CorrectItemDialog.spec.tsx` and
// `AmendCustomerOrderDialog.spec.tsx` test their own dialogs: `onSave` is a
// spy standing in for the mutation trigger `ClosedPurchaseDraftLine` will
// inject, so what this file proves is the dialog's own contract — what it
// shows, what it lets a member touch, and what it hands to `onSave` — never
// the wiring to a live endpoint.

const rejection = (
  overrides: Partial<PurchaseDraftLineRejection> = {},
): PurchaseDraftLineRejection => ({
  id: '00000000-0000-4000-8000-000000000501',
  rejectionReasonId: 'damaged_by_packing',
  rejectionReasonLabel: 'Damaged by packing',
  quantity: 5,
  source: 'inspected',
  description: 'Two pallets were crushed in transit.',
  disposition: 'held_for_return',
  raisedByUserId: '00000000-0000-4000-8000-000000000601',
  raisedAt: '2026-09-01T09:00:00.000Z',
  amendedByUserId: null,
  amendedAt: null,
  ...overrides,
});

const renderDialog = (
  subject: PurchaseDraftLineRejection = rejection(),
  result: MutationResult = {
    data: {
      id: subject.id,
      description: subject.description,
      disposition: subject.disposition,
      amendedByUserId: '00000000-0000-4000-8000-000000000601',
      amendedAt: '2026-09-01T09:00:00.000Z',
    },
  },
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: RejectionAmend) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <AmendRefusalDialog rejection={subject} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

/**
 * HeroUI's `Select` renders both the interactive `ListBox.Item` and an
 * always-`display:none` native `<option>` carrying the same accessible name
 * (`test/hero-select.ts`), so a query by role and name alone matches two
 * elements once the popover is open. This is the open-list counterpart to
 * that helper's own filter.
 */
const findOpenOption = (name: RegExp): HTMLElement | undefined =>
  screen
    .getAllByRole('option', { name, hidden: true })
    .find((candidate) => candidate.tagName !== 'OPTION');

const queryOpenOption = (name: RegExp): HTMLElement | undefined =>
  screen
    .queryAllByRole('option', { name, hidden: true })
    .find((candidate) => candidate.tagName !== 'OPTION');

describe('AmendRefusalDialog — it is a FormModalDialog, never a ConfirmAlertDialog (web-dialogs.md §1)', () => {
  it('renders under role="dialog", the FormModalDialog role — not role="alertdialog"', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('is not drawn at the 720px width the two ending modals use — every other modal, this one included, stays 440px', () => {
    renderDialog();

    // `FormModalDialog` marks only the 720px "wide" ending modals with this
    // class (`isWide ? 'md:max-w-[45rem]' : undefined`); its absence is what
    // keeps this dialog at HeroUI's own default width rather than the widest
    // one the application opens.
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).not.toMatch(/max-w-\[45rem\]/u);
  });
});

describe('AmendRefusalDialog — the defaultValues trap (react-hook-form + HeroUI FormTextField/FormTextAreaField)', () => {
  it('opens with the recorded description already in the field — not just handed to useForm', () => {
    renderDialog(
      rejection({ description: 'Outer coil crushed; two runs severed.' }),
    );

    // HeroUI's `FormTextAreaField` wraps React Aria's `TextField`, which
    // reads its initial value from its own `defaultValue` prop and ignores
    // react-hook-form's `defaultValues` entirely. A dialog that hands the
    // description only to `useForm({ defaultValues })` renders this field
    // empty, which is exactly what this assertion catches.
    expect(
      screen.getByLabelText(/description/iu, { selector: 'textarea' }),
    ).toHaveValue('Outer coil crushed; two runs severed.');
  });

  it('opens with the recorded Disposition already selected in the trigger', () => {
    renderDialog(rejection({ disposition: 'refused_at_delivery' }));

    expect(
      screen.getByRole('button', { name: /disposition/iu }),
    ).toHaveTextContent(/refused at delivery/iu);
  });
});

describe('AmendRefusalDialog — a description-only amendment leaves the Disposition untouched (AC-18b)', () => {
  it('submits only the corrected description, carrying no disposition key at all', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog(
      rejection({ disposition: 'held_for_return' }),
    );

    const description = screen.getByLabelText(/description/iu, {
      selector: 'textarea',
    });
    await user.clear(description);
    await user.type(description, 'Outer coil crushed; three runs severed.');
    await user.click(screen.getByRole('button', { name: /save/iu }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0] as [RejectionAmend];
    expect(input).toStrictEqual({
      description: 'Outer coil crushed; three runs severed.',
    });
    expect(input).not.toHaveProperty('disposition');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AmendRefusalDialog — a correction between two decided Dispositions is offered (AC-18)', () => {
  it('submits only the newly chosen Disposition when the description is left as it was', async () => {
    const user = userEvent.setup();
    // Already decided — `held_for_return` — proving the correction is not
    // reachable only from `undecided`: no decision is terminal.
    const { onClose, onSave } = renderDialog(
      rejection({ disposition: 'held_for_return' }),
    );

    await selectHeroOption(
      user,
      screen.getByRole('button', { name: /disposition/iu }),
      'Refused at delivery',
    );
    await user.click(screen.getByRole('button', { name: /save/iu }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0] as [RejectionAmend];
    expect(input).toStrictEqual({ disposition: 'refused_at_delivery' });
    expect(input).not.toHaveProperty('description');
    expect(onClose).toHaveBeenCalled();
  });

  it('submits both fields together in the one request that names both new values (the fields are not two half-tested seams)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog(
      rejection({
        disposition: 'held_for_return',
        description: 'Two pallets were crushed in transit.',
      }),
    );

    const description = screen.getByLabelText(/description/iu, {
      selector: 'textarea',
    });
    await user.clear(description);
    await user.type(description, 'Supplier collected on 21 September.');
    await selectHeroOption(
      user,
      screen.getByRole('button', { name: /disposition/iu }),
      'Scrapped on site',
    );
    await user.click(screen.getByRole('button', { name: /save/iu }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      description: 'Supplier collected on 21 September.',
      disposition: 'scrapped_on_site',
    });
  });
});

// review-2026-09-09, finding 4. AC-18's Given is "a recorded Rejection whose
// disposition is still undecided" — it says nothing about a description, and a
// description is optional on every Reason the catalogue does not flag
// (`rejectionCreateSchema.description` is `.optional()`), so
// `line-ending-form.ts` stores an omitted one as NULL. The dialog rendered the
// field `isRequired` with a react-hook-form `required` rule seeded from
// `rejection.description ?? ''`, so on such a Rejection `handleSubmit` never
// ran and the member had to invent prose to record "held for return". Every
// fixture in this file set a non-null description, which is why nothing caught
// it.
describe('AmendRefusalDialog — a Rejection recorded without prose can still be decided (AC-18)', () => {
  it('submits a Disposition alone when the Rejection carries no description', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog(
      rejection({ disposition: 'undecided', description: null }),
    );

    await selectHeroOption(
      user,
      screen.getByRole('button', { name: /disposition/iu }),
      'Held for return',
    );
    await user.click(screen.getByRole('button', { name: /save/iu }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0] as [RejectionAmend];
    expect(input).toStrictEqual({ disposition: 'held_for_return' });
    expect(input).not.toHaveProperty('description');
    expect(onClose).toHaveBeenCalled();
  });

  // The other half of the rule: where prose *was* recorded, blanking it is
  // still refused. `rejectionAmendSchema.description` is `.optional()` and not
  // nullable precisely because "clearing is not offered" — blank after
  // trimming is a refusal, not a clear — so the dialog must not offer a way to
  // send one.
  it('still refuses a blank description on a Rejection that was recorded with one', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog(
      rejection({
        disposition: 'undecided',
        description: 'Two pallets were crushed in transit.',
      }),
    );

    await user.clear(
      screen.getByLabelText(/description/iu, { selector: 'textarea' }),
    );
    await user.click(screen.getByRole('button', { name: /save/iu }));

    await waitFor(() =>
      expect(
        screen.getByLabelText(/description/iu, { selector: 'textarea' }),
      ).toBeInvalid(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('AmendRefusalDialog — AC-18a: once decided, Undecided is absent from the list, never shown disabled', () => {
  it('offers Undecided while the Rejection is still undecided', async () => {
    const user = userEvent.setup();
    renderDialog(rejection({ disposition: 'undecided' }));

    await user.click(screen.getByRole('button', { name: /disposition/iu }));
    expect(findOpenOption(/^undecided$/iu)).toBeInTheDocument();
  });

  it('omits Undecided once the Rejection has been decided — not present-and-disabled', async () => {
    const user = userEvent.setup();
    renderDialog(rejection({ disposition: 'held_for_return' }));

    await user.click(screen.getByRole('button', { name: /disposition/iu }));
    expect(queryOpenOption(/^undecided$/iu)).toBeUndefined();
    // The remaining three decisions stay offered — this is an omission of
    // one option, not a collapse of the whole list.
    expect(findOpenOption(/refused at delivery/iu)).toBeInTheDocument();
    expect(findOpenOption(/scrapped on site/iu)).toBeInTheDocument();
  });
});

describe('AmendRefusalDialog — nothing here writes quantity, Reason or Source (spec.md §6 condition immutability)', () => {
  it('renders exactly one editable control for description and one for Disposition, and nothing else', () => {
    renderDialog();

    // The fixed part of a Rejection — its quantity, Reason and Source — is
    // unwritable after recording; the surface offers no control for any of
    // them at all, not a disabled one.
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    // The Disposition picker is the dialog's only field-picking trigger
    // besides Cancel/Save — no Reason picker sits beside it.
    expect(
      screen.queryByRole('button', { name: /reason/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /disposition/iu }),
    ).toHaveLength(1);
    expect(screen.queryByText(/damaged by packing/iu)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/inspected at your dock/iu),
    ).not.toBeInTheDocument();
  });
});

describe('AmendRefusalDialog — AC-19: an unoffered Disposition is explained by naming the ones that are offered', () => {
  it('names the available Dispositions on the field, and leaves the dialog open', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(rejection({ disposition: 'undecided' }), {
      error: {
        code: 'request.invalid',
        fieldErrors: { disposition: 'invalid_enum_value' },
      },
    });

    await selectHeroOption(
      user,
      screen.getByRole('button', { name: /disposition/iu }),
      'Held for return',
    );
    await user.click(screen.getByRole('button', { name: /save/iu }));

    const dialog = screen.getByRole('dialog');
    const message = await within(dialog).findByText(
      /refused at delivery.*held for return.*scrapped on site|held for return.*refused at delivery.*scrapped on site/iu,
    );
    expect(message).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
