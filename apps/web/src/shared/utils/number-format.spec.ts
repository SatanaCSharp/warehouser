import { describe, expect, it } from 'vitest';

import {
  formatQuantity,
  QUANTITY_GROUP_SEPARATOR,
} from 'shared/utils/number-format';

describe('formatQuantity', () => {
  it('groups thousands with a no-break space, as the frames draw it', () => {
    expect(formatQuantity(1200, 'en')).toBe(`1${QUANTITY_GROUP_SEPARATOR}200`);
    expect(QUANTITY_GROUP_SEPARATOR).toBe('\u00A0');
  });

  it("never renders the locale's own separator instead", () => {
    expect(formatQuantity(1200, 'en')).not.toContain(',');
    expect(formatQuantity(1200, 'uk')).toBe(`1${QUANTITY_GROUP_SEPARATOR}200`);
  });

  it('leaves a figure below a thousand ungrouped', () => {
    expect(formatQuantity(320, 'en')).toBe('320');
    expect(formatQuantity(0, 'en')).toBe('0');
  });

  it('groups every thousands boundary of a larger figure', () => {
    expect(formatQuantity(1234567, 'en')).toBe(
      `1${QUANTITY_GROUP_SEPARATOR}234${QUANTITY_GROUP_SEPARATOR}567`,
    );
  });
});
