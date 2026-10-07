import type { AnyFormApi } from '@tanstack/react-form';
import { describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { placeRefusalOnFields } from '../logic/place-refusal';

/** A form with the fields it is given, which keeps the meta it is handed. */
function fakeForm(fields: string[]) {
  const meta = new Map<string, { errorMap?: Record<string, unknown> }>(
    fields.map((field) => [field, {}]),
  );
  const form = {
    getFieldMeta: (field: string) => meta.get(field),
    setFieldMeta: vi.fn(
      (
        field: string,
        update: (previous: { errorMap?: Record<string, unknown> }) => {
          errorMap?: Record<string, unknown>;
        },
      ) => {
        meta.set(field, update(meta.get(field) ?? {}));
      },
    ),
  };

  return {
    form: form as unknown as AnyFormApi,
    shown: (field: string) => meta.get(field)?.errorMap?.onServer,
  };
}

const failure = (
  body: Record<string, unknown>,
  status = 422,
) => new ApiError({ data: { ...body, status }, status });

const FIELDS = {
  byCode: { 'Op.ReferenceTooLong': 'reference' },
  byLocation: { reference: 'reference', note: 'note' },
};

describe('showing a refusal on the field it is about', () => {
  it('puts it on the field its code names, in the API\'s words', () => {
    const { form, shown } = fakeForm(['reference', 'note']);

    const placed = placeRefusalOnFields(
      form,
      failure({ code: 'Op.ReferenceTooLong', detail: 'reference is too long' }),
      FIELDS,
    );

    expect(placed).toBe(true);
    expect(shown('reference')).toEqual({ message: 'reference is too long' });
    expect(shown('note')).toBeUndefined();
  });

  it('puts an error the API located on the field of its location', () => {
    const { form, shown } = fakeForm(['reference', 'note']);

    const placed = placeRefusalOnFields(
      form,
      failure({
        code: 'Op.Invalid',
        detail: 'invalid',
        errors: [{ location: 'body.note', message: 'note is too long' }],
      }),
      FIELDS,
    );

    expect(placed).toBe(true);
    expect(shown('note')).toEqual({ message: 'note is too long' });
  });

  it('does not place a refusal that is about no field, which the dialog shows itself', () => {
    const { form, shown } = fakeForm(['reference', 'note']);

    const placed = placeRefusalOnFields(
      form,
      failure({ code: 'Op.InvalidStatus', detail: 'not payable' }, 409),
      FIELDS,
    );

    expect(placed).toBe(false);
    expect(shown('reference')).toBeUndefined();
    expect(shown('note')).toBeUndefined();
  });

  it('does not place an error on a field that is not on the form', () => {
    const { form } = fakeForm(['reference']);

    expect(
      placeRefusalOnFields(
        form,
        failure({
          code: 'Op.Invalid',
          detail: 'invalid',
          errors: [{ location: 'body.note', message: 'note is too long' }],
        }),
        FIELDS,
      ),
    ).toBe(false);
  });

  it('does not place a failure that is not a refusal: a network error', () => {
    const { form } = fakeForm(['reference']);

    expect(placeRefusalOnFields(form, new Error('Failed to fetch'), FIELDS)).toBe(
      false,
    );
  });

  it('places nothing when no field is declared', () => {
    const { form } = fakeForm(['reference']);

    expect(
      placeRefusalOnFields(
        form,
        failure({ code: 'Op.ReferenceTooLong', detail: 'too long' }),
      ),
    ).toBe(false);
  });
});
