import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item, ItemUpdate } from '@warehouser/contracts/items';
import { CorrectItemDialog } from 'modules/item/components/item-directory/components/CorrectItemDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// T18 — corrects an Item's SKU, description or unit of measure independently
// (AC-06b, AC-06c). DoD: BOTH halves of AC-06c are reachable — an Item nothing
// yet names may have its SKU corrected, and one something already names is
// refused with a message that NAMES what holds it. Colocated with the dialog it
// covers (`placing-web-tests.md` §1).

const anItem = (overrides: Partial<Item> = {}): Item => ({
  id: '00000000-0000-4000-8000-000000000210',
  sku: 'SKU-500',
  description: 'Original description',
  unitOfMeasure: 'each',
  onHandQuantity: 5,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  ...overrides,
});

const renderDialog = (
  item: Item = anItem(),
  onSave: (input: ItemUpdate) => Promise<MutationResult> = vi
    .fn<(input: ItemUpdate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: item }),
  items: Item[] = [item],
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CorrectItemDialog item={item} items={items} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose };
};

const dialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: /correct SKU-500/iu });

const retype = async (
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  value: string,
): Promise<void> => {
  const field = within(dialog()).getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
};

const save = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> => {
  await user.click(
    within(dialog()).getByRole('button', { name: /save changes/iu }),
  );
};

describe('CorrectItemDialog', () => {
  it('names its subject in the title (frame `s5EPi` board rule 1)', () => {
    renderDialog();

    expect(dialog()).toHaveAccessibleName(
      'Correct SKU-500 · Original description',
    );
  });

  it('corrects the description alone, leaving the SKU and the unit untouched (AC-06b)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemUpdate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: anItem() });
    const { onClose } = renderDialog(anItem(), onSave);

    await retype(user, /description/iu, 'Corrected description');
    await save(user);

    expect(onSave).toHaveBeenCalledWith({
      description: 'Corrected description',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('corrects the unit of measure alone, leaving the description untouched (AC-06b)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemUpdate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: anItem() });
    const { onClose } = renderDialog(anItem(), onSave);

    await retype(user, /counted in/iu, 'case');
    await save(user);

    expect(onSave).toHaveBeenCalledWith({ unitOfMeasure: 'case' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // AC-06c's legal half. Without a SKU field it is unreachable, which is the
  // defect this case exists to keep fixed.
  it('corrects the SKU of an Item nothing yet names (AC-06c, the half that is allowed)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemUpdate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: anItem() });
    const { onClose } = renderDialog(anItem(), onSave);

    await retype(user, /^sku$/iu, 'SKU-501');
    await save(user);

    expect(onSave).toHaveBeenCalledWith({ sku: 'SKU-501' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('names what holds the SKU when the correction is refused (AC-06c, the half that is not)', async () => {
    const user = userEvent.setup();
    const named = anItem({
      namingCustomerOrderCount: 3,
      namingPurchaseDraftLineCount: 1,
    });
    const onSave = vi
      .fn<(input: ItemUpdate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.sku_fixed', fieldErrors: { sku: 'skuFixed' } },
      });
    renderDialog(named, onSave);

    await retype(user, /^sku$/iu, 'SKU-501');
    await save(user);

    expect(
      await within(dialog()).findByText(
        /SKU-500 is named by 3 customer orders and 1 draft line, so its SKU is fixed for the life of this item\./u,
      ),
    ).toBeVisible();
    expect(dialog()).toBeInTheDocument();
  });

  it('names the Item that already holds a SKU corrected to one in use (AC-07)', async () => {
    const user = userEvent.setup();
    const item = anItem();
    const other = anItem({
      id: '00000000-0000-4000-8000-000000000211',
      sku: 'SKU-501',
      description: 'Pallet wrap, 500mm',
    });
    const onSave = vi
      .fn<(input: ItemUpdate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.sku_taken', fieldErrors: { sku: 'skuTaken' } },
      });
    renderDialog(item, onSave, [item, other]);

    await retype(user, /^sku$/iu, 'SKU-501');
    await save(user);

    expect(
      await within(dialog()).findByText(
        /SKU-501 already names “Pallet wrap, 500mm” in this warehouse/u,
      ),
    ).toBeVisible();
  });

  it('states that the description and the unit stay correctable', () => {
    renderDialog();

    expect(dialog()).toHaveTextContent(
      /still correctable — as is the unit it is counted in/iu,
    );
    expect(dialog()).toHaveTextContent(
      /an item that nothing yet names may still have its SKU corrected/iu,
    );
  });
});
