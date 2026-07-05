import { isDefined, isEmpty, isNull, isProd, isUndefined } from 'predicates';

describe('predicates', () => {
  describe('isDefined', () => {
    it('returns true for non-null and non-undefined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
    });

    it('returns false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isUndefined', () => {
    it('returns true only for undefined', () => {
      expect(isUndefined(undefined)).toBe(true);
      expect(isUndefined(null)).toBe(false);
      expect(isUndefined(0)).toBe(false);
    });
  });

  describe('isNull', () => {
    it('returns true only for null', () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
      expect(isNull(0)).toBe(false);
    });
  });

  describe('isEmpty', () => {
    it('returns true for values with length 0', () => {
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
    });

    it('returns false for values with length > 0', () => {
      expect(isEmpty('a')).toBe(false);
      expect(isEmpty([1])).toBe(false);
    });
  });

  describe('isProd', () => {
    it('returns true only for "production"', () => {
      expect(isProd('production')).toBe(true);
      expect(isProd('development')).toBe(false);
      expect(isProd('prod')).toBe(false);
    });
  });
});
