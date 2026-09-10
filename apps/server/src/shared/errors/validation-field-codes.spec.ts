import { BadRequestException } from '@nestjs/common';
import { ZodValidationException, ZodValidationPipe } from 'nestjs-zod';
import { validationFieldCodes } from 'shared/errors/validation-field-codes';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// The shape the ordering request contracts share: a whole-number quantity with a
// floor and a ceiling, a calendar date, an identifier, and a nested line array
// (`packages/contracts/src/customer-orders/customer-orders-mutations.ts`).
const schema = z.strictObject({
  itemId: z.uuid(),
  customerName: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  neededBy: z.iso.date(),
  lines: z
    .array(z.strictObject({ quantity: z.number().int().min(1) }))
    .optional(),
});

const validBody = {
  itemId: '4d3f2b1a-0000-4000-8000-000000000000',
  customerName: 'Northwind',
  quantity: 12,
  neededBy: '2026-09-01',
};

const refuse = (body: unknown): unknown => {
  try {
    new ZodValidationPipe(schema).transform(body, { type: 'body' });
  } catch (exception) {
    return exception;
  }

  throw new Error('The schema accepted a body the test expected it to refuse');
};

const fieldsFor = (
  body: unknown,
): Readonly<Record<string, string>> | undefined =>
  validationFieldCodes(refuse(body), { body });

describe('validationFieldCodes', () => {
  it('names a field the request never supplied as required', () => {
    expect(fieldsFor({ quantity: 12 })).toEqual({
      itemId: 'required',
      customerName: 'required',
      neededBy: 'required',
    });
  });

  it('names a field supplied as null as required', () => {
    expect(fieldsFor({ ...validBody, customerName: null })).toEqual({
      customerName: 'required',
    });
  });

  it('separates a below-minimum quantity from an above-maximum one', () => {
    expect(fieldsFor({ ...validBody, quantity: 0 })).toEqual({
      quantity: 'tooSmall',
    });
    expect(fieldsFor({ ...validBody, quantity: -5 })).toEqual({
      quantity: 'tooSmall',
    });
    expect(fieldsFor({ ...validBody, quantity: 1000 })).toEqual({
      quantity: 'tooBig',
    });
  });

  it('names a supplied non-integer quantity as invalid rather than required', () => {
    // Zod v4 refuses a fractional `z.number().int()` as `invalid_type`, which the
    // normalization table maps to `invalid`; the value was supplied, so it is
    // never mistaken for a missing one.
    expect(fieldsFor({ ...validBody, quantity: 2.5 })).toEqual({
      quantity: 'invalid',
    });
  });

  it('names a value that breaks an explicit step as notMultipleOf', () => {
    const pack = z.strictObject({ quantity: z.number().multipleOf(12) });
    const body = { quantity: 7 };
    const exception = (() => {
      try {
        new ZodValidationPipe(pack).transform(body, { type: 'body' });
      } catch (thrown) {
        return thrown;
      }

      throw new Error('The schema accepted 7 as a multiple of 12');
    })();

    expect(validationFieldCodes(exception, { body })).toEqual({
      quantity: 'notMultipleOf',
    });
  });

  it('names a badly formatted string as invalid', () => {
    expect(
      fieldsFor({ ...validBody, itemId: 'not-a-uuid', neededBy: '01/09/2026' }),
    ).toEqual({ itemId: 'invalid', neededBy: 'invalid' });
  });

  it('names a refused array element by its indexed dotted path', () => {
    expect(
      fieldsFor({
        ...validBody,
        lines: [{ quantity: 4 }, { quantity: 0 }, {}],
      }),
    ).toEqual({
      'lines.1.quantity': 'tooSmall',
      'lines.2.quantity': 'required',
    });
  });

  it('reads a refused query parameter from the query payload', () => {
    const query = { state: 'unknown' };
    const listQuery = z.strictObject({ state: z.enum(['open', 'closed']) });
    const exception = (() => {
      try {
        new ZodValidationPipe(listQuery).transform(query, { type: 'query' });
      } catch (thrown) {
        return thrown;
      }

      throw new Error('The schema accepted an unknown state');
    })();

    expect(validationFieldCodes(exception, { query })).toEqual({
      state: 'invalid',
    });
  });

  it('keeps the highest-ranked code when several issues share one path', () => {
    // Ranked, not first-reported: whichever order Zod emits them in, the same
    // code wins, and a missing value outranks any rule about its contents.
    const ranked = new ZodValidationException({
      issues: [
        { code: 'too_small', path: ['quantity'] },
        { code: 'invalid_type', path: ['quantity'] },
        { code: 'custom', path: ['quantity'] },
      ],
    });
    const reversed = new ZodValidationException({
      issues: [
        { code: 'custom', path: ['quantity'] },
        { code: 'invalid_type', path: ['quantity'] },
        { code: 'too_small', path: ['quantity'] },
      ],
    });

    expect(validationFieldCodes(ranked, { body: {} })).toEqual({
      quantity: 'required',
    });
    expect(validationFieldCodes(reversed, { body: {} })).toEqual({
      quantity: 'required',
    });
    expect(validationFieldCodes(ranked, { body: { quantity: 0 } })).toEqual({
      quantity: 'tooSmall',
    });
  });

  // The reducer this replaced accumulated with `{ ...fields, [field]: code }`, copying the whole
  // accumulator per issue: 10 000 issues took 10 s and 20 000 took 42 s of synchronous,
  // event-loop-blocking time, reachable from one request because NestJS runs guards before pipes.
  describe('a refusal carrying a very large issue set', () => {
    const manyIssues = (count: number): { issues: readonly unknown[] } => ({
      issues: Array.from({ length: count }, (_unused, index) => ({
        code: 'too_small',
        path: ['lines', index, 'quantity'],
      })),
    });

    it('names at most fifty fields however many the schema refused', () => {
      const fields = validationFieldCodes(
        new ZodValidationException(manyIssues(20_000)),
        { body: {} },
      );

      expect(Object.keys(fields ?? {})).toHaveLength(50);
      // The fifty named are the first the schema reported, in that order — not an arbitrary
      // fifty — so the same request always names the same fields.
      expect(Object.keys(fields ?? {})[0]).toBe('lines.0.quantity');
      expect(Object.keys(fields ?? {})[49]).toBe('lines.49.quantity');
      expect(Object.keys(fields ?? {})).not.toContain('lines.50.quantity');
    });

    it('gives a named field the same code the tie-break would give it uncapped', () => {
      // `lines.0.quantity` is refused twice — once before the cap fills and once long after — and
      // the second issue outranks the first. A cap that stopped considering issues once it was
      // full would leave the field on `tooSmall`; the rank tie-break has to still reach it.
      const spread = new ZodValidationException({
        issues: [
          { code: 'too_small', path: ['lines', 0, 'quantity'] },
          ...manyIssues(20_000).issues,
          { code: 'invalid_type', path: ['lines', 0, 'quantity'] },
        ],
      });

      expect(validationFieldCodes(spread, { body: {} })).toMatchObject({
        'lines.0.quantity': 'required',
      });
    });

    it('completes a twenty-thousand-issue refusal in linear time', () => {
      // A budget, not a benchmark: the quadratic reducer took ~42 s here, so a one-second ceiling
      // has more than an order of magnitude of headroom over the linear cost (single-digit
      // milliseconds) and still fails outright if quadratic accumulation ever returns.
      const started = performance.now();
      validationFieldCodes(new ZodValidationException(manyIssues(20_000)), {
        body: {},
      });

      expect(performance.now() - started).toBeLessThan(1_000);
    });
  });

  it('never reflects a key the request itself supplied', () => {
    const rejected = new ZodValidationException({
      issues: [
        { code: 'unrecognized_keys', keys: ['coverage'], path: [] },
        { code: 'custom', path: ['<script>alert(1)</script>'] },
        { code: 'custom', path: [Symbol('quantity')] },
      ],
    });

    expect(validationFieldCodes(rejected, { body: {} })).toBeUndefined();
  });

  it('ignores an exception that is not a Zod validation failure', () => {
    expect(
      validationFieldCodes(new BadRequestException('unsafe text'), {
        body: {},
      }),
    ).toBeUndefined();
    expect(
      validationFieldCodes(new Error('boom'), { body: {} }),
    ).toBeUndefined();
  });

  it('ignores a Zod exception whose error carries no issue list', () => {
    expect(
      validationFieldCodes(new ZodValidationException('opaque'), { body: {} }),
    ).toBeUndefined();
  });
});
