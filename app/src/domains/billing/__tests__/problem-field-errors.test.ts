import type { AnyFormApi } from '@tanstack/react-form';
import { describe, expect, it } from 'vite-plus/test';
import {
  clearProblemFieldError,
  setProblemFieldError,
} from '../logic/problem-field-errors';

type Meta = { errorMap?: { onServer?: unknown }; isTouched?: boolean };

/** A form that tells its listeners when its state changes, as the store of the real one does. */
function liveForm(initial = 'typed') {
  const state = { meta: {} as Meta, value: initial };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) {
      listener();
    }
  };
  const form = {
    getFieldMeta: () => state.meta,
    getFieldValue: () => state.value,
    setFieldMeta: (_field: string, update: (previous: Meta) => Meta) => {
      state.meta = update(state.meta);
      notify();
    },
    store: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);

        return { unsubscribe: () => listeners.delete(listener) };
      },
    },
  };

  return {
    form: form as unknown as AnyFormApi,
    shown: () => state.meta.errorMap?.onServer,
    touched: () => state.meta.isTouched,
    // What a field that is taken off the screen and drawn again does to its state.
    remount: () => {
      state.meta = {};
      notify();
    },
    type: (value: string) => {
      state.value = value;
      notify();
    },
  };
}

describe('a refusal of the API shown as the error of a field', () => {
  it('is the API words on the field, which is marked as visited so that it is read', () => {
    const { form, shown, touched } = liveForm();

    setProblemFieldError(form, 'code', 'another voucher has this code');

    expect(shown()).toEqual({ message: 'another voucher has this code' });
    expect(touched()).toBe(true);
  });

  it('carries what else the caller gives it, beside the message', () => {
    const { form, shown } = liveForm();

    setProblemFieldError(form, 'code', 'taken', { code: 'CreateVoucher.CodeConflict' });

    expect(shown()).toEqual({ code: 'CreateVoucher.CodeConflict', message: 'taken' });
  });

  it('goes when what was typed changes: the field is no longer wrong by what the API said', () => {
    const { form, shown, type } = liveForm();
    setProblemFieldError(form, 'code', 'taken');

    type('another');

    expect(shown()).toBeUndefined();
  });

  it('stands when the field is taken off the screen and drawn again, since what was typed has not changed', () => {
    const { form, remount, shown } = liveForm();
    setProblemFieldError(form, 'code', 'taken');

    remount();

    expect(shown()).toEqual({ message: 'taken' });
  });

  it('does not come back once what was typed has changed, whatever happens to the field after', () => {
    const { form, remount, shown, type } = liveForm();
    setProblemFieldError(form, 'code', 'taken');
    type('another');

    remount();

    expect(shown()).toBeUndefined();
  });

  it('is replaced by a newer refusal of the same field, which is not shown twice', () => {
    const { form, remount, shown } = liveForm();
    setProblemFieldError(form, 'code', 'first');
    setProblemFieldError(form, 'code', 'second');

    remount();

    expect(shown()).toEqual({ message: 'second' });
  });
});

describe('taking a refusal off a field', () => {
  it('leaves the field with no error, though what was typed on it has not changed', () => {
    const { form, remount, shown } = liveForm();
    setProblemFieldError(form, 'code', 'a short code needs a bound');

    clearProblemFieldError(form, 'code');
    // It is gone for good: it does not come back when the field is drawn again.
    remount();

    expect(shown()).toBeUndefined();
  });

  it('does nothing for a field that has no refusal', () => {
    const { form, shown } = liveForm();

    clearProblemFieldError(form, 'code');

    expect(shown()).toBeUndefined();
  });
});
