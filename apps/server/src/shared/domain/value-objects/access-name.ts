import { assert } from '@warehouser/utils/asserts';

const MAX_GRAPHEMES = 100;
const UNSUPPORTED_CHARACTER = /[\p{Cc}\p{Cf}]/u;

interface GraphemeSegmenter {
  segment(value: string): Iterable<unknown>;
}

interface GraphemeSegmenterConstructor {
  new (
    locale?: string,
    options?: { readonly granularity: 'grapheme' },
  ): GraphemeSegmenter;
}

const GraphemeSegmenter = (
  Intl as unknown as { readonly Segmenter: GraphemeSegmenterConstructor }
).Segmenter;
const segmenter = new GraphemeSegmenter(undefined, {
  granularity: 'grapheme',
});

export class AccessName {
  private constructor(readonly value: string) {}

  static create(input: string): AccessName {
    const value = input.trim();
    const graphemeCount = Array.from(segmenter.segment(value)).length;

    assert(value.length > 0, 'Name must not be empty');
    assert(
      graphemeCount <= MAX_GRAPHEMES,
      'Name must contain at most 100 user-perceived characters',
    );
    assert(
      !UNSUPPORTED_CHARACTER.test(value),
      'Name must not contain control or format characters',
    );
    return new AccessName(value);
  }

  conflictsWith(existing: readonly AccessName[]): boolean {
    return existing.some((name) => name.value === this.value);
  }
}
