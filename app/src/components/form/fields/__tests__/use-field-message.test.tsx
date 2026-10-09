import { renderHook } from '@testing-library/react';
import i18next from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vite-plus/test';
import useField from '../use-field';

const mockUseFieldContext = vi.hoisted(() => vi.fn());

vi.mock('../../form-context', () => ({
  useFieldContext: () => mockUseFieldContext(),
}));

// An instance set up like the console's own (`lib/i18n/config.ts`): the one of the unit
// tests answers a missing key with itself, which is not how the console reads a message
// that is no key.
const i18n = i18next.createInstance();
await i18n.init({
  interpolation: { escapeValue: false },
  lng: 'en',
  resources: {
    en: { translation: { Errors: { required: 'This field is required' } } },
  },
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const messageOf = (message: string) => {
  mockUseFieldContext.mockReturnValue({
    handleBlur: vi.fn(),
    handleChange: vi.fn(),
    name: 'origins',
    state: { meta: { errors: [{ message }], isTouched: true }, value: '' },
  });

  return renderHook(() => useField<string>(), { wrapper }).result.current
    .errorMessage;
};

describe('the message of a field error', () => {
  it('translates a key', () => {
    expect(messageOf('Errors.required')).toBe('This field is required');
  });

  it('shows the words of the API as they were written, whatever punctuation they carry', () => {
    const words =
      '"https://exa.mple" is not an origin: expected https://host[:port], or http://localhost[:port]';

    expect(messageOf(words)).toBe(words);
  });

  it('shows a message that is no key of the catalogue as it is', () => {
    expect(messageOf('Enter a valid e-mail address.')).toBe(
      'Enter a valid e-mail address.',
    );
  });
});
